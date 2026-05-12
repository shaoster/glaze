import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AnalysisIndex from "../AnalysisIndex";
import * as api from "../../util/api";

vi.mock("../../util/api", () => ({
  fetchGlazeCombinationImages: vi.fn(),
}));

vi.mock("../CloudinaryImage", () => ({
  default: () => <div data-testid="mock-image" />,
}));

describe("AnalysisIndex", () => {
  it("renders analysis cards", () => {
    vi.mocked(api.fetchGlazeCombinationImages).mockResolvedValue([]);
    
    render(
      <MemoryRouter>
        <AnalysisIndex />
      </MemoryRouter>
    );

    expect(screen.getByText("Glaze Combinations")).toBeInTheDocument();
    expect(screen.getByText("Firing Results")).toBeInTheDocument();
  });
});
