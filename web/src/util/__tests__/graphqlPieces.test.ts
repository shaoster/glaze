import { describe, expect, it } from "vitest";
import { PIECE_ORDERING_GQL, PIECES_QUERY } from "../graphqlPieces";

describe("PIECE_ORDERING_GQL", () => {
  it("maps all six REST sort orders to GraphQL enum values", () => {
    expect(PIECE_ORDERING_GQL).toEqual({
      "-last_modified": "LAST_MODIFIED_DESC",
      last_modified: "LAST_MODIFIED_ASC",
      name: "NAME_ASC",
      "-name": "NAME_DESC",
      created: "CREATED_ASC",
      "-created": "CREATED_DESC",
    });
  });

  it("has exactly six entries", () => {
    expect(Object.keys(PIECE_ORDERING_GQL)).toHaveLength(6);
  });
});

describe("PIECES_QUERY", () => {
  it("is a string (graphql-request v7 gql returns a string)", () => {
    expect(typeof PIECES_QUERY).toBe("string");
  });

  it("declares the Pieces query operation", () => {
    expect(PIECES_QUERY).toContain("query Pieces");
  });

  it("selects the pieces field with count and results", () => {
    expect(PIECES_QUERY).toContain("pieces(");
    expect(PIECES_QUERY).toContain("count");
    expect(PIECES_QUERY).toContain("results");
  });
});
