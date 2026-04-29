import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import PieceHistory from "../PieceHistory";
import type { PieceState, CaptionedImage } from "../../util/types";

vi.mock("../../../workflow.yml", () => ({
  default: {
    version: "test",
    globals: {},
    states: [
      {
        id: "designed",
        visible: true,
        friendly_name: "Designing",
        description: "Design phase.",
        successors: [],
        past_friendly_name: "Designed",
      },
      {
        id: "wheel_thrown",
        visible: true,
        friendly_name: "Throwing",
        description: "Wheel-thrown.",
        successors: [],
        past_friendly_name: "Wheel Thrown",
      },
    ],
  },
}));

vi.mock("../CloudinaryImage", () => ({
  default: ({ url, alt }: { url: string; alt: string }) => (
    <img src={url} alt={alt} />
  ),
}));

vi.mock("../ImageLightbox", () => ({
  default: ({
    onClose,
    onSetAsThumbnail,
    images,
    initialIndex,
  }: {
    onClose: () => void;
    onSetAsThumbnail: (img: CaptionedImage) => Promise<void>;
    images: CaptionedImage[];
    initialIndex: number;
  }) => (
    <div data-testid="lightbox">
      <button onClick={onClose}>Close</button>
      <button onClick={() => void onSetAsThumbnail(images[initialIndex])}>
        Set as thumbnail
      </button>
      <span data-testid="lightbox-index">{initialIndex}</span>
    </div>
  ),
}));

function makeState(overrides: Partial<PieceState> = {}): PieceState {
  return {
    state: "designed",
    notes: "",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-01-15T10:00:00Z"),
    images: [],
    previous_state: null,
    next_state: null,
    additional_fields: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PieceHistory", () => {
  it("renders nothing when there are no past states", () => {
    const { container } = render(
      <PieceHistory
        pastHistory={[]}
        onSetAsThumbnail={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the history toggle button when there is history", async () => {
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed" })]}
          onSetAsThumbnail={vi.fn()}
        />,
      );
    });
    expect(
      screen.getByRole("button", { name: /show history/i }),
    ).toBeInTheDocument();
  });

  it("shows 'Show history' button by default (not 'Hide history')", async () => {
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[
            makeState({ state: "designed" }),
            makeState({ state: "wheel_thrown" }),
          ]}
          onSetAsThumbnail={vi.fn()}
        />,
      );
    });
    expect(screen.getByRole("button", { name: /show history/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /hide history/i })).not.toBeInTheDocument();
  });

  it("toggling shows and hides the history panel", async () => {
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed" })]}
          onSetAsThumbnail={vi.fn()}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(screen.getByRole("button", { name: /hide history/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /hide history/i }));
    expect(screen.getByRole("button", { name: /show history/i })).toBeInTheDocument();
  });

  it("shows past state labels and timestamps when open", async () => {
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed", notes: "Test note" })]}
          onSetAsThumbnail={vi.fn()}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(screen.getByText("Designed")).toBeInTheDocument();
    expect(screen.getByText(/Test note/)).toBeInTheDocument();
  });

  it("clicking a history image opens the lightbox at the correct index", async () => {
    const img1: CaptionedImage = {
      url: "http://example.com/img1.jpg",
      caption: "First",
      created: new Date(),
      cloudinary_public_id: null,
    };
    const img2: CaptionedImage = {
      url: "http://example.com/img2.jpg",
      caption: "Second",
      created: new Date(),
      cloudinary_public_id: null,
    };
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[
            makeState({ state: "designed", images: [img1] }),
            makeState({ state: "wheel_thrown", images: [img2] }),
          ]}
          onSetAsThumbnail={vi.fn()}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    fireEvent.click(screen.getByRole("button", { name: "View image 2" }));
    expect(screen.getByTestId("lightbox")).toBeInTheDocument();
    expect(screen.getByTestId("lightbox-index")).toHaveTextContent("1");
  });

  it("closing the lightbox hides it", async () => {
    const img: CaptionedImage = {
      url: "http://example.com/img.jpg",
      caption: "",
      created: new Date(),
      cloudinary_public_id: null,
    };
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed", images: [img] })]}
          onSetAsThumbnail={vi.fn()}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    fireEvent.click(screen.getByRole("button", { name: "View image 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("lightbox")).not.toBeInTheDocument();
  });

  it("setAsThumbnail calls the callback with the correct image", async () => {
    const img: CaptionedImage = {
      url: "http://example.com/thumb.jpg",
      caption: "cap",
      created: new Date(),
      cloudinary_public_id: null,
    };
    const onSetAsThumbnail = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed", images: [img] })]}
          currentThumbnailUrl="http://example.com/current.jpg"
          onSetAsThumbnail={onSetAsThumbnail}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    fireEvent.click(screen.getByRole("button", { name: "View image 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Set as thumbnail" }));
    expect(onSetAsThumbnail).toHaveBeenCalledWith(img);
  });
});
