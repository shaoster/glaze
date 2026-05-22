/**
 * Generates TypeScript types from the OpenAPI schema.
 *
 * By default this reads the live schema from a backend running on port 8080.
 * Set GLAZE_SCHEMA_SOURCE to a local schema file path to avoid the network hop
 * in sandboxed environments.
 * Run via: npm run generate-types
 *
 * Transforms applied on top of the raw schema:
 *   - format: date-time  →  Date  (Axios delivers strings; api.ts converts at runtime)
 */

import openapiTS, { astToString } from "openapi-typescript";
import ts from "typescript";
import { resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { readFileSync, writeFileSync } from "fs";

// Bazel passes paths as positional args relative to execroot/_main.
// BAZEL_BINDIR is always set in Bazel actions; use it to anchor back to execroot.
// For local `npm run generate-types`, fall back to env vars / defaults.
export function resolvePath(p) {
  if (!p || p.startsWith("/")) return p;
  const bazelBindir = process.env.BAZEL_BINDIR;
  // BAZEL_BINDIR is e.g. "bazel-out/k8-fastbuild/bin" — 3 levels deep from execroot
  const execroot = bazelBindir
    ? resolve(process.cwd(), "../".repeat(bazelBindir.split("/").length))
    : process.cwd();
  return resolve(execroot, p);
}

function refComponentName(schemaObject) {
  const directRef = schemaObject?.$ref;
  const allOfRef = schemaObject?.allOf?.[0]?.$ref;
  const ref = directRef ?? allOfRef;
  return typeof ref === "string"
    ? ref.match(/^#\/components\/schemas\/(.+)$/)?.[1]
    : undefined;
}

function collectComponentNormalizers(components) {
  return Object.fromEntries(
    Object.entries(components)
      .filter(
        ([, schemaObject]) =>
          typeof schemaObject?.["x-glaze-normalizer"] === "string",
      )
      .map(([componentName, schemaObject]) => [
        componentName,
        schemaObject["x-glaze-normalizer"],
      ]),
  );
}

export function extractNormalizationMetadata(openApiSchema) {
  const components = openApiSchema?.components?.schemas ?? {};
  const componentNormalizers = collectComponentNormalizers(components);
  const fieldNormalizers = {};
  const relations = {};

  for (const [componentName, schemaObject] of Object.entries(components)) {
    const properties = schemaObject?.properties ?? {};
    for (const [fieldName, fieldSchema] of Object.entries(properties)) {
      const fieldRef = refComponentName(fieldSchema);
      const fieldNormalizer = fieldRef ? componentNormalizers[fieldRef] : undefined;
      if (fieldNormalizer) {
        fieldNormalizers[componentName] ??= {};
        fieldNormalizers[componentName][fieldName] = fieldNormalizer;
      }

      const relation = fieldSchema?.["x-glaze-relation"];
      if (relation) {
        relations[componentName] ??= {};
        relations[componentName][fieldName] = relation;
      }
    }
  }

  return { fieldNormalizers, relations };
}

export function renderNormalizationMetadataModule(metadata) {
  return `\
/**
 * This file was auto-generated from OpenAPI schema extensions.
 * Run \`npm run generate-types\` to regenerate.
 * DO NOT EDIT BY HAND.
 */

export const SCHEMA_FIELD_NORMALIZERS: Record<string, Record<string, "imageCrop">> = ${JSON.stringify(metadata.fieldNormalizers, null, 2)};

export const SCHEMA_RELATIONS: Record<
  string,
  Record<string, { component: string; shape: string; many?: boolean }>
> = ${JSON.stringify(metadata.relations, null, 2)};

export type SchemaFieldNormalizer = "imageCrop";

export function normalizeSchemaField(
  componentName: string,
  fieldName: string,
  value: unknown,
): unknown {
  const normalizer = SCHEMA_FIELD_NORMALIZERS[componentName]?.[fieldName];
  if (normalizer === "imageCrop") return normalizeImageCrop(value);
  return value;
}

function normalizeImageCrop(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const crop = value as Record<string, unknown>;
  const x = Number(crop.x);
  const y = Number(crop.y);
  const width = Number(crop.width);
  const height = Number(crop.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    x: Math.min(Math.max(x, 0), 1),
    y: Math.min(Math.max(y, 0), 1),
    width: Math.min(Math.max(width, 0), 1),
    height: Math.min(Math.max(height, 0), 1),
  };
}
`;
}

async function loadOpenApiSchema(schemaUrl) {
  if (schemaUrl.protocol === "file:") {
    return JSON.parse(readFileSync(fileURLToPath(schemaUrl), "utf8"));
  }
  const response = await fetch(schemaUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenAPI schema: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}

export async function main(argv = process.argv) {
  const [, , argSchema, argOutput, argNormalizerOutput] = argv;
  const schemaSource = argSchema ?? process.env.GLAZE_SCHEMA_SOURCE;
  const schema = schemaSource
    ? pathToFileURL(resolvePath(schemaSource))
    : new URL("http://localhost:8080/api/schema/?format=json");
  const outputPath =
    resolvePath(argOutput) ?? process.env.GLAZE_OUTPUT_PATH ?? "src/util/generated-types.ts";
  const normalizerOutputPath =
    resolvePath(argNormalizerOutput) ??
    process.env.GLAZE_NORMALIZER_OUTPUT_PATH ??
    "src/util/generated-normalizers.ts";

  const HEADER = `\
/**
 * This file was auto-generated by openapi-typescript.
 * Run \`npm run generate-types\` to regenerate.
 * DO NOT EDIT BY HAND.
 */

`;

  const DATE_NODE = ts.factory.createTypeReferenceNode(
    ts.factory.createIdentifier("Date"),
  );

  const ast = await openapiTS(schema, {
    transform(schemaObject) {
      if (schemaObject.format === "date-time") {
        return DATE_NODE;
      }
    },
  });

  const openApiSchema = await loadOpenApiSchema(schema);
  const metadata = extractNormalizationMetadata(openApiSchema);

  writeFileSync(outputPath, HEADER + astToString(ast));
  writeFileSync(normalizerOutputPath, renderNormalizationMetadataModule(metadata));
  console.log(`✔ Generated ${outputPath}`);
  console.log(`✔ Generated ${normalizerOutputPath}`);
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedAsScript) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
