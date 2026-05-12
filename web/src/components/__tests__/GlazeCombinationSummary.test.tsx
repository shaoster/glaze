import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GlazeCombinationSummary from "../GlazeCombinationSummary";
import * as api from "../../util/api";

vi.mock("../../util/api", () => ({
  fetchGlazeCombinationImages: vi.fn(),
}));

vi.mock("../CloudinaryImage", () => ({
  default: () => <div data-testid="mock-image" />,
}));

describe("GlazeCombinationSummary", () => {
  it("shows loading state", () => {
    vi.mocked(api.fetchGlazeCombinationImages).mockReturnValue(new Promise(() => {}));
    render(<GlazeCombinationSummary />);
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
  });

  it("renders count and thumbnails", async () => {
    const mockData = [
      {
        glaze_combination: { id: "1", name: "Combo 1" },
        pieces: [
          {
            id: "p1",
            images: [{ url: "url1" }],
          },
        ],
      },
      {
        glaze_combination: { id: "2", name: "Combo 2" },
        pieces: [
          {
            id: "p2",
            images: [{ url: "url2" }],
          },
        ],
      },
    ];
    vi.mocked(api.fetchGlazeCombinationImages).mockResolvedValue(mockData as any);
    
    render(<GlazeCombinationSummary />);
    
    expect(await screen.findByText(/2 combinations with images/i)).toBeInTheDocument();
    expect(screen.getAllByTestId("mock-image")).toHaveLength(2);
  });
});
