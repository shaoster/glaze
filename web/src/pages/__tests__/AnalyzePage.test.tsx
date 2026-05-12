import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AnalyzePage from "../AnalyzePage";
import * as api from "../../util/api";

vi.mock("../../util/api", () => ({
  fetchGlazeCombinationImages: vi.fn(),
}));

vi.mock("../../components/CloudinaryImage", () => ({
  default: () => <div data-testid="mock-image" />,
}));

describe("AnalyzePage", () => {
  it("renders AnalysisIndex by default", async () => {
    vi.mocked(api.fetchGlazeCombinationImages).mockResolvedValue([]);
    
    render(
      <MemoryRouter initialEntries={["/analyze"]}>
        <Routes>
          <Route path="/analyze/*" element={<AnalyzePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Glaze Combinations")).toBeInTheDocument();
  });

  it("renders GlazeCombinationGallery on sub-route with back button", async () => {
    vi.mocked(api.fetchGlazeCombinationImages).mockResolvedValue([]);
    
    render(
      <MemoryRouter initialEntries={["/analyze/glaze-combinations"]}>
        <Routes>
          <Route path="/analyze/*" element={<AnalyzePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("link", { name: /back/i })).toBeInTheDocument();
    expect(screen.getByText("Glaze Combinations")).toBeInTheDocument();
  });
});
