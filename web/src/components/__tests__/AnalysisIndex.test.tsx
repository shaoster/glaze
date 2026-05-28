import { type ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AnalysisIndex from "../AnalysisIndex";

vi.mock("../ErrorBoundary", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../GlazeCombinationSummary", () => ({
  default: () => <div>Mock Summary</div>,
}));

describe("AnalysisIndex", () => {
  it("renders analysis cards", () => {
    render(
      <MemoryRouter>
        <AnalysisIndex />
      </MemoryRouter>,
    );

    expect(screen.getByText("Glaze Combinations")).toBeInTheDocument();
    expect(screen.getByText("Firing Results")).toBeInTheDocument();
  });
});
