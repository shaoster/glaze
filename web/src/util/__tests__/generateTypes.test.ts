import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractNormalizationMetadata,
  renderNormalizationMetadataModule,
  resolvePath,
} from "../../../scripts/generate-types.mjs";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("generate-types script helpers", () => {
  it("passes through absolute paths unchanged", () => {
    expect(resolvePath("/tmp/schema.json")).toBe("/tmp/schema.json");
  });

  it("resolves relative paths from the current working directory", () => {
    vi.stubEnv("BAZEL_BINDIR", "");
    vi.spyOn(process, "cwd").mockReturnValue("/repo/web");

    expect(resolvePath("src/util/generated-types.ts")).toBe(
      "/repo/web/src/util/generated-types.ts",
    );
  });

  it("extracts field normalizers and relation metadata from schema extensions", () => {
    const metadata = extractNormalizationMetadata({
      components: {
        schemas: {
          ImageCrop: { "x-glaze-normalizer": "imageCrop" },
          CaptionedImage: {
            properties: {
              crop: {
                allOf: [{ $ref: "#/components/schemas/ImageCrop" }],
                nullable: true,
              },
            },
          },
          PieceSummary: {
            properties: {
              current_state: {
                allOf: [{ $ref: "#/components/schemas/StateSummary" }],
                "x-glaze-relation": {
                  component: "StateSummary",
                  shape: "summary",
                },
              },
            },
          },
        },
      },
    });

    expect(metadata.fieldNormalizers).toEqual({
      CaptionedImage: { crop: "imageCrop" },
    });
    expect(metadata.relations).toEqual({
      PieceSummary: {
        current_state: { component: "StateSummary", shape: "summary" },
      },
    });
  });

  it("renders normalization metadata as a generated TypeScript module", () => {
    const output = renderNormalizationMetadataModule({
      fieldNormalizers: { Thumbnail: { crop: "imageCrop" } },
      relations: {},
    });

    expect(output).toContain("SCHEMA_FIELD_NORMALIZERS");
    expect(output).toContain('"Thumbnail"');
    expect(output).toContain("normalizeSchemaField");
  });
});
