import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("renders error state", async () => {
    vi.mocked(api.fetchGlazeCombinationImages).mockRejectedValue(new Error("API Error"));
    render(<GlazeCombinationSummary />);
    
    await waitFor(() => {
      expect(screen.queryByText(/combinations with images/i)).not.toBeInTheDocument();
    });
  });

  it("renders '+N' label when more than 4 combinations", async () => {
    const mockData = Array.from({ length: 6 }, (_, i) => ({
      glaze_combination: { id: `${i}`, name: `Combo ${i}` },
      pieces: [{ id: `p${i}`, images: [{ url: `url${i}` }] }],
    }));
    vi.mocked(api.fetchGlazeCombinationImages).mockResolvedValue(mockData as any);
    
    render(<GlazeCombinationSummary />);
    
    expect(await screen.findByText("+2")).toBeInTheDocument();
  });

  it("renders singular 'combination' when count is 1", async () => {
    const mockData = [
      {
        glaze_combination: { id: "1", name: "Combo 1" },
        pieces: [{ id: "p1", images: [{ url: "url1" }] }],
      },
    ];
    vi.mocked(api.fetchGlazeCombinationImages).mockResolvedValue(mockData as any);
    
    render(<GlazeCombinationSummary />);
    
    expect(await screen.findByText("1 combination with images")).toBeInTheDocument();
  });
});
