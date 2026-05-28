import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRegister = vi.fn();
const mockRegisterInstrumentations = vi.fn();
const mockWebTracerProvider = vi.fn(function WebTracerProvider() {
  return {
    register: mockRegister,
  };
});
const mockBatchSpanProcessor = vi.fn(function BatchSpanProcessor(exporter) {
  return { exporter };
});
const mockOTLPTraceExporter = vi.fn(function OTLPTraceExporter(options) {
  return options;
});
const mockResourceFromAttributes = vi.fn((attributes) => ({ attributes }));
const mockDocumentLoadInstrumentation = vi.fn(
  function DocumentLoadInstrumentation(config) {
    return {
      kind: "document-load",
      config,
    };
  },
);
const mockFetchInstrumentation = vi.fn(function FetchInstrumentation(config) {
  return {
    kind: "fetch",
    config,
  };
});
const mockUserInteractionInstrumentation = vi.fn(
  function UserInteractionInstrumentation(config) {
    return {
      kind: "user-interaction",
      config,
    };
  },
);
const mockXMLHttpRequestInstrumentation = vi.fn(
  function XMLHttpRequestInstrumentation(config) {
    return {
      kind: "xml-http-request",
      config,
    };
  },
);

vi.mock("@opentelemetry/resources", () => ({
  resourceFromAttributes: mockResourceFromAttributes,
}));

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: mockOTLPTraceExporter,
}));

vi.mock("@opentelemetry/instrumentation", () => ({
  registerInstrumentations: mockRegisterInstrumentations,
}));

vi.mock("@opentelemetry/sdk-trace-web", () => ({
  WebTracerProvider: mockWebTracerProvider,
  BatchSpanProcessor: mockBatchSpanProcessor,
}));

vi.mock("@opentelemetry/instrumentation-document-load", () => ({
  DocumentLoadInstrumentation: mockDocumentLoadInstrumentation,
}));

vi.mock("@opentelemetry/instrumentation-fetch", () => ({
  FetchInstrumentation: mockFetchInstrumentation,
}));

vi.mock("@opentelemetry/instrumentation-user-interaction", () => ({
  UserInteractionInstrumentation: mockUserInteractionInstrumentation,
}));

vi.mock("@opentelemetry/instrumentation-xml-http-request", () => ({
  XMLHttpRequestInstrumentation: mockXMLHttpRequestInstrumentation,
}));

async function loadTelemetryModule() {
  vi.resetModules();
  return import("../telemetry");
}

beforeEach(() => {
  vi.clearAllMocks();
  document.cookie = "potterdoc_csrftoken=csrf-token-123; path=/";
});

describe("initializeFrontendTelemetry", () => {
  it("registers browser tracing with the collector proxy endpoint", async () => {
    const { initializeFrontendTelemetry } = await loadTelemetryModule();
    const collectorUrl = new URL(
      "/api/telemetry/traces/",
      window.location.origin,
    ).href;

    initializeFrontendTelemetry();

    expect(mockResourceFromAttributes).toHaveBeenCalledWith({
      "service.name": "glaze-web",
      "service.instance.id": window.location.host,
    });
    expect(mockOTLPTraceExporter).toHaveBeenCalledWith({
      url: collectorUrl,
      headers: { "X-CSRFToken": "csrf-token-123" },
    });
    expect(mockBatchSpanProcessor).toHaveBeenCalledTimes(1);
    expect(mockBatchSpanProcessor).toHaveBeenCalledWith({
      url: collectorUrl,
      headers: { "X-CSRFToken": "csrf-token-123" },
    });
    expect(mockWebTracerProvider).toHaveBeenCalledTimes(1);
    expect(mockWebTracerProvider).toHaveBeenCalledWith({
      resource: {
        attributes: {
          "service.name": "glaze-web",
          "service.instance.id": window.location.host,
        },
      },
      spanProcessors: [
        {
          exporter: {
            url: collectorUrl,
            headers: { "X-CSRFToken": "csrf-token-123" },
          },
        },
      ],
    });
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockRegisterInstrumentations).toHaveBeenCalledWith({
      instrumentations: [
        { kind: "document-load", config: undefined },
        { kind: "fetch", config: { ignoreUrls: [collectorUrl] } },
        {
          kind: "xml-http-request",
          config: { ignoreUrls: [collectorUrl] },
        },
        { kind: "user-interaction", config: undefined },
      ],
    });
  });

  it("is a no-op after the first initialization", async () => {
    const { initializeFrontendTelemetry } = await loadTelemetryModule();

    initializeFrontendTelemetry();
    initializeFrontendTelemetry();

    expect(mockWebTracerProvider).toHaveBeenCalledTimes(1);
    expect(mockRegisterInstrumentations).toHaveBeenCalledTimes(1);
  });
});
