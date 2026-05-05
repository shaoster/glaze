import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImageLightbox from "../ImageLightbox";
import type { CaptionedImage } from "../../util/types";

function makeImage(url: string, caption = ""): CaptionedImage {
  return { url, caption, created: new Date("2024-01-15T10:00:00Z") };
}

const ONE_IMAGE = [makeImage("/img/a.jpg", "First")];
const THREE_IMAGES = [
  makeImage("/img/a.jpg", "First"),
  makeImage("/img/b.jpg", "Second"),
  makeImage("/img/c.jpg", ""),
];

function renderLightbox(
  images: CaptionedImage[],
  initialIndex = 0,
  onClose = vi.fn(),
  onSetAsThumbnail?: (image: CaptionedImage) => Promise<void>,
) {
  return {
    onClose,
    ...render(
      <ImageLightbox
        images={images}
        initialIndex={initialIndex}
        onClose={onClose}
        onSetAsThumbnail={onSetAsThumbnail}
      />,
    ),
  };
}

describe("ImageLightbox", () => {
  describe("image display", () => {
    it("renders the image at initialIndex", () => {
      renderLightbox(THREE_IMAGES, 1);
      const img = screen.getByRole("img");
      expect(img).toHaveAttribute("src", "/img/b.jpg");
      expect(img).toHaveAttribute("alt", "Second");
    });

    it("uses the caption as image alt text when present", () => {
      renderLightbox(ONE_IMAGE, 0);
      expect(screen.getByRole("img")).toHaveAttribute("alt", "First");
    });

    it("does not show a caption element when caption is empty", () => {
      const { container } = renderLightbox(THREE_IMAGES, 2);
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/c.jpg");
      const paragraphs = container.querySelectorAll("p");
      paragraphs.forEach((p) => expect(p.textContent).not.toBe(""));
    });

    it("uses fallback alt text when caption is empty", () => {
      renderLightbox(THREE_IMAGES, 2);
      expect(screen.getByRole("img")).toHaveAttribute("alt", "Pottery image");
    });
  });

  describe("navigation", () => {
    it("shows prev/next buttons for multiple images", () => {
      renderLightbox(THREE_IMAGES, 1);
      expect(
        screen.getByRole("button", { name: /previous image/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /next image/i }),
      ).toBeInTheDocument();
    });

    it("does not show navigation buttons for a single image", () => {
      renderLightbox(ONE_IMAGE, 0);
      expect(
        screen.queryByRole("button", { name: /previous image/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /next image/i }),
      ).not.toBeInTheDocument();
    });

    it("prev button is disabled on the first image", () => {
      renderLightbox(THREE_IMAGES, 0);
      expect(
        screen.getByRole("button", { name: /previous image/i }),
      ).toBeDisabled();
    });

    it("next button is disabled on the last image", () => {
      renderLightbox(THREE_IMAGES, 2);
      expect(
        screen.getByRole("button", { name: /next image/i }),
      ).toBeDisabled();
    });

    it("clicking next advances to the next image", () => {
      renderLightbox(THREE_IMAGES, 0);
      fireEvent.click(screen.getByRole("button", { name: /next image/i }));
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/b.jpg");
    });

    it("clicking prev goes back to the previous image", () => {
      renderLightbox(THREE_IMAGES, 2);
      fireEvent.click(screen.getByRole("button", { name: /previous image/i }));
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/b.jpg");
    });

    it("cannot navigate before the first image", () => {
      renderLightbox(THREE_IMAGES, 0);
      fireEvent.click(screen.getByRole("button", { name: /previous image/i }));
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/a.jpg");
    });

    it("cannot navigate past the last image", () => {
      renderLightbox(THREE_IMAGES, 2);
      fireEvent.click(screen.getByRole("button", { name: /next image/i }));
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/c.jpg");
    });

    it("shows image counter with current position and total", () => {
      renderLightbox(THREE_IMAGES, 1);
      const counter = screen.getByText((_, el) => el?.textContent === "2 / 3");
      expect(counter).toBeInTheDocument();
    });

    it("counter reflects the initialIndex", () => {
      renderLightbox(THREE_IMAGES, 0);
      const counter = screen.getByText((_, el) => el?.textContent === "1 / 3");
      expect(counter).toBeInTheDocument();
    });

    it("counter updates after navigation", () => {
      renderLightbox(THREE_IMAGES, 0);
      fireEvent.click(screen.getByRole("button", { name: /next image/i }));
      const counter = screen.getByText((_, el) => el?.textContent === "2 / 3");
      expect(counter).toBeInTheDocument();
    });
  });

  describe("indicator dots", () => {
    it("shows one dot per image when there are multiple images", () => {
      renderLightbox(THREE_IMAGES, 0);
      expect(
        screen.getAllByRole("button", { name: /go to image/i }),
      ).toHaveLength(3);
    });

    it("does not show indicator dots for a single image", () => {
      renderLightbox(ONE_IMAGE, 0);
      expect(
        screen.queryByRole("button", { name: /go to image/i }),
      ).not.toBeInTheDocument();
    });

    it("clicking a dot navigates to that image", () => {
      renderLightbox(THREE_IMAGES, 0);
      fireEvent.click(screen.getByRole("button", { name: "Go to image 3" }));
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/c.jpg");
    });
  });

  describe("close behavior", () => {
    it("calls onClose when backdrop is clicked", () => {
      const { onClose } = renderLightbox(THREE_IMAGES, 0);
      fireEvent.click(screen.getByTestId("lightbox-backdrop"));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("nav button clicks do not propagate to close the lightbox", () => {
      const { onClose } = renderLightbox(THREE_IMAGES, 1);
      fireEvent.click(screen.getByRole("button", { name: /next image/i }));
      expect(onClose).not.toHaveBeenCalled();
    });

    it("calls onSetAsThumbnail with the active image", async () => {
      const onSetAsThumbnail = vi.fn().mockResolvedValue(undefined);
      renderLightbox(THREE_IMAGES, 1, vi.fn(), onSetAsThumbnail);

      await userEvent.click(
        screen.getByRole("button", { name: "Set as thumbnail" }),
      );

      await waitFor(() =>
        expect(onSetAsThumbnail).toHaveBeenCalledWith(THREE_IMAGES[1]),
      );
    });
  });

  describe("touch swipe", () => {
    function getSwipeArea() {
      return screen.getByTestId("lightbox-swipe-area");
    }

    it("swipe right (positive delta > 50px) navigates to previous image", () => {
      renderLightbox(THREE_IMAGES, 1);
      const area = getSwipeArea();
      fireEvent.touchStart(area, { touches: [{ clientX: 200, clientY: 0 }] });
      fireEvent.touchMove(area, { touches: [{ clientX: 260, clientY: 0 }] });
      fireEvent.touchEnd(area, { changedTouches: [{ clientX: 260, clientY: 0 }] });
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/a.jpg");
    });

    it("swipe left (negative delta > 50px) navigates to next image", () => {
      renderLightbox(THREE_IMAGES, 1);
      const area = getSwipeArea();
      fireEvent.touchStart(area, { touches: [{ clientX: 200, clientY: 0 }] });
      fireEvent.touchMove(area, { touches: [{ clientX: 140, clientY: 0 }] });
      fireEvent.touchEnd(area, { changedTouches: [{ clientX: 140, clientY: 0 }] });
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/c.jpg");
    });

    it("small swipe (< 50px) does not navigate", () => {
      renderLightbox(THREE_IMAGES, 1);
      const area = getSwipeArea();
      fireEvent.touchStart(area, { touches: [{ clientX: 200, clientY: 0 }] });
      fireEvent.touchMove(area, { touches: [{ clientX: 230, clientY: 0 }] });
      fireEvent.touchEnd(area, { changedTouches: [{ clientX: 230, clientY: 0 }] });
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/b.jpg");
    });

    it("swipe does not go past the first image", () => {
      renderLightbox(THREE_IMAGES, 0);
      const area = getSwipeArea();
      fireEvent.touchStart(area, { touches: [{ clientX: 200, clientY: 0 }] });
      fireEvent.touchMove(area, { touches: [{ clientX: 260, clientY: 0 }] });
      fireEvent.touchEnd(area, { changedTouches: [{ clientX: 260, clientY: 0 }] });
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/a.jpg");
    });

    it("swipe does not go past the last image", () => {
      renderLightbox(THREE_IMAGES, 2);
      const area = getSwipeArea();
      fireEvent.touchStart(area, { touches: [{ clientX: 200, clientY: 0 }] });
      fireEvent.touchMove(area, { touches: [{ clientX: 140, clientY: 0 }] });
      fireEvent.touchEnd(area, { changedTouches: [{ clientX: 140, clientY: 0 }] });
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/c.jpg");
    });
  });
});
