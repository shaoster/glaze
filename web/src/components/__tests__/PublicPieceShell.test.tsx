import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PublicPieceShell from "../PublicPieceShell";
import { useAsync } from "../../util/useAsync";

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "piece-1" }),
}));

vi.mock("../../util/useAsync", () => ({
  useAsync: vi.fn(),
}));

describe("PublicPieceShell", () => {
  it("renders PotterDoc chrome and loading state", () => {
    (useAsync as any).mockReturnValue({
      data: null,
      loading: true,
      error: null,
    });

    render(<PublicPieceShell />);

    expect(screen.getByText("PotterDoc")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders piece content when loaded", () => {
    (useAsync as any).mockReturnValue({
      data: {
        id: "piece-1",
        name: "Beautiful Bowl",
        showcase_story: "This is a story.",
        showcase_fields: [],
        thumbnail: null,
        history: [],
      },
      loading: false,
      error: null,
    });

    render(<PublicPieceShell />);

    expect(screen.getByText("Beautiful Bowl")).toBeInTheDocument();
    expect(screen.getByText("This is a story.")).toBeInTheDocument();
  });
});
