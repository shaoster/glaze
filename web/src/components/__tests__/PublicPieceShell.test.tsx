import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PublicPieceShell from "../PublicPieceShell";

describe("PublicPieceShell", () => {
  it("renders PotterDoc chrome around public content", () => {
    render(
      <PublicPieceShell>
        <main>Shared piece detail</main>
      </PublicPieceShell>,
    );

    expect(screen.getByText("PotterDoc")).toBeInTheDocument();
    expect(
      screen.getByAltText("PotterDoc app icon"),
    ).toBeInTheDocument();
    expect(screen.getByText("Shared piece detail")).toBeInTheDocument();
  });
});
