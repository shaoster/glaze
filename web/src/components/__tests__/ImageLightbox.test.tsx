import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ImageLightbox from "../ImageLightbox";
import type { CaptionedImage } from "../..//types";

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
) {
  return {
    onClose,
    ...render(
      <ImageLightbox
        images={images}
        initialIndex={initialIndex}
        onClose={onClose}
      />,
    ),
  };
}

// jsdom has `ontouchstart` in window by default, making isTouchDevice always true.
// Remove it before each test so the component sees a non-touch device unless explicitly changed.
beforeEach(() => {
  delete (window as Window & { ontouchstart?: unknown }).ontouchstart;
});

describe("ImageLightbox", () => {
  describe("image display", () => {
    it("renders the image at initialIndex", () => {
      renderLightbox(THREE_IMAGES, 1);
      const img = screen.getByRole("img");
      expect(img).toHaveAttribute("src", "/img/b.jpg");
      expect(img).toHaveAttribute("alt", "Second");
    });

    it("shows caption when present", () => {
      renderLightbox(ONE_IMAGE, 0);
      expect(screen.getByText("First")).toBeInTheDocument();
    });

    it("does not show a caption element when caption is empty", () => {
      const { container } = renderLightbox(THREE_IMAGES, 2);
      // Image renders but no Typography caption should be present
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/c.jpg");
      // The only <p> elements are from MUI structure, none containing caption text
      const paragraphs = container.querySelectorAll("p");
      paragraphs.forEach((p) => expect(p.textContent).not.toBe(""));
    });

    it("uses fallback alt text when caption is empty", () => {
      renderLightbox(THREE_IMAGES, 2);
      expect(screen.getByRole("img")).toHaveAttribute("alt", "Pottery image");
    });
  });

  describe("navigation", () => {
    it("shows prev/next buttons for multiple images on non-touch device", () => {
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
      // Counter text may be split across text nodes; match by combined textContent
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

  describe("close behavior", () => {
    it("calls onClose when backdrop is clicked", () => {
      const { onClose } = renderLightbox(THREE_IMAGES, 0);
      // The outer Box has onClick={onClose}; click parent of the <img>
      fireEvent.click(screen.getByRole("img").parentElement!);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("nav button clicks do not propagate to close the lightbox", () => {
      const { onClose } = renderLightbox(THREE_IMAGES, 1);
      fireEvent.click(screen.getByRole("button", { name: /next image/i }));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("touch swipe", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "maxTouchPoints", {
        value: 1,
        configurable: true,
        writable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(navigator, "maxTouchPoints", {
        value: 0,
        configurable: true,
        writable: true,
      });
    });

    it("hides nav buttons on touch device", () => {
      renderLightbox(THREE_IMAGES, 1);
      expect(
        screen.queryByRole("button", { name: /previous image/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /next image/i }),
      ).not.toBeInTheDocument();
    });

    it("swipe right (positive delta > 50px) navigates to previous image", () => {
      renderLightbox(THREE_IMAGES, 1);
      const box = screen.getByRole("img").parentElement!;
      fireEvent.touchStart(box, { touches: [{ clientX: 200 }] });
      fireEvent.touchEnd(box, { changedTouches: [{ clientX: 260 }] });
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/a.jpg");
    });

    it("swipe left (negative delta > 50px) navigates to next image", () => {
      renderLightbox(THREE_IMAGES, 1);
      const box = screen.getByRole("img").parentElement!;
      fireEvent.touchStart(box, { touches: [{ clientX: 200 }] });
      fireEvent.touchEnd(box, { changedTouches: [{ clientX: 140 }] });
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/c.jpg");
    });

    it("small swipe (< 50px) does not navigate", () => {
      renderLightbox(THREE_IMAGES, 1);
      const box = screen.getByRole("img").parentElement!;
      fireEvent.touchStart(box, { touches: [{ clientX: 200 }] });
      fireEvent.touchEnd(box, { changedTouches: [{ clientX: 230 }] });
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/b.jpg");
    });

    it("swipe does not go past the first image", () => {
      renderLightbox(THREE_IMAGES, 0);
      const box = screen.getByRole("img").parentElement!;
      fireEvent.touchStart(box, { touches: [{ clientX: 200 }] });
      fireEvent.touchEnd(box, { changedTouches: [{ clientX: 260 }] });
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/a.jpg");
    });

    it("swipe does not go past the last image", () => {
      renderLightbox(THREE_IMAGES, 2);
      const box = screen.getByRole("img").parentElement!;
      fireEvent.touchStart(box, { touches: [{ clientX: 200 }] });
      fireEvent.touchEnd(box, { changedTouches: [{ clientX: 140 }] });
      expect(screen.getByRole("img")).toHaveAttribute("src", "/img/c.jpg");
    });
  });
});
