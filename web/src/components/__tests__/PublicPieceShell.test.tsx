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

  it("renders piece content with showcase story and custom fields when loaded", () => {
    (useAsync as any).mockReturnValue({
      data: {
        id: "piece-1",
        name: "Beautiful Bowl",
        showcase_story: "This is a hand-crafted bowl.",
        showcase_fields: ["state1.material", "state1.emptyField", "state1.validBool"],
        thumbnail: null,
        history: [
          {
            state: "state1",
            custom_fields: { 
              material: "Clay",
              emptyField: "",
              validBool: true
            },
          },
        ],
      },
      loading: false,
      error: null,
    });

    render(<PublicPieceShell />);

    expect(screen.getByText("Beautiful Bowl")).toBeInTheDocument();
    expect(screen.getByText("This is a hand-crafted bowl.")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
    
    // Check included fields
    expect(screen.getByText("Clay")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument(); // boolean true maps to Yes
    
    // Check that empty field is filtered out
    expect(screen.queryByText("EmptyField")).not.toBeInTheDocument();
  });
});
