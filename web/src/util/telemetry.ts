import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { WebTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-web";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { UserInteractionInstrumentation } from "@opentelemetry/instrumentation-user-interaction";
import { XMLHttpRequestInstrumentation } from "@opentelemetry/instrumentation-xml-http-request";

const TRACE_EXPORT_URL = "/api/telemetry/traces/";
const SERVICE_NAME = "glaze-web";

let frontendTelemetryInitialized = false;

function readCookie(name: string): string | null {
  const cookiePrefix = `${name}=`;
  for (const cookie of document.cookie.split(";")) {
    const trimmedCookie = cookie.trim();
    if (trimmedCookie.startsWith(cookiePrefix)) {
      return decodeURIComponent(trimmedCookie.slice(cookiePrefix.length));
    }
  }
  return null;
}

export function initializeFrontendTelemetry(): void {
  if (frontendTelemetryInitialized || typeof window === "undefined") {
    return;
  }

  const collectorUrl = new URL(TRACE_EXPORT_URL, window.location.origin).href;
  const csrfToken = readCookie("potterdoc_csrftoken");
  const spanProcessor = new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: collectorUrl,
      headers: csrfToken ? { "X-CSRFToken": csrfToken } : undefined,
    }),
  );
  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({
      "service.name": SERVICE_NAME,
      "service.instance.id": window.location.host,
    }),
    spanProcessors: [spanProcessor],
  });
  provider.register();

  registerInstrumentations({
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new FetchInstrumentation({
        ignoreUrls: [collectorUrl],
      }),
      new XMLHttpRequestInstrumentation({
        ignoreUrls: [collectorUrl],
      }),
      new UserInteractionInstrumentation(),
    ],
  });

  frontendTelemetryInitialized = true;
}
