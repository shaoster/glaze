import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppImage, { SuspenseAppImage } from "../AppImage";

const ORIGINAL_URL = "https://cdn.example.com/images/original.jpg";
const CROPPED_URL = "https://cdn.example.com/images/original__crop.jpg";

function render(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return baseRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("AppImage", () => {
  it("renders the materialized cropped URL when present", () => {
    render(
      <AppImage
        url={ORIGINAL_URL}
        croppedUrl={CROPPED_URL}
        context="thumbnail"
        data-testid="app-image"
      />,
    );
    expect(screen.getByTestId("app-image")).toHaveAttribute(
      "src",
      CROPPED_URL,
    );
  });

  it("falls back to the original URL when croppedUrl is null", () => {
    render(
      <AppImage
        url={ORIGINAL_URL}
        croppedUrl={null}
        context="thumbnail"
        data-testid="app-image"
      />,
    );
    expect(screen.getByTestId("app-image")).toHaveAttribute(
      "src",
      ORIGINAL_URL,
    );
  });

  it("falls back to the original URL when croppedUrl is blank", () => {
    render(
      <AppImage
        url={ORIGINAL_URL}
        croppedUrl="   "
        context="gallery"
        data-testid="app-image"
      />,
    );
    expect(screen.getByTestId("app-image")).toHaveAttribute(
      "src",
      ORIGINAL_URL,
    );
  });

  it("shows a skeleton and no img when crop is set but croppedUrl is null", () => {
    render(
      <AppImage
        url={ORIGINAL_URL}
        croppedUrl={null}
        crop={{ x: 0.1, y: 0.1, width: 0.8, height: 0.6 }}
        context="gallery"
        data-testid="app-image"
      />,
    );
    expect(screen.queryByTestId("app-image")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders the img once croppedUrl is populated (crop no longer pending)", () => {
    render(
      <AppImage
        url={ORIGINAL_URL}
        croppedUrl={CROPPED_URL}
        crop={{ x: 0.1, y: 0.1, width: 0.8, height: 0.6 }}
        context="gallery"
        data-testid="app-image"
      />,
    );
    expect(screen.getByTestId("app-image")).toHaveAttribute("src", CROPPED_URL);
  });

  it("clears the loading spinner once the image load event fires", () => {
    const onLoad = vi.fn();
    render(
      <AppImage
        url={ORIGINAL_URL}
        context="thumbnail"
        data-testid="app-image"
        onLoad={onLoad}
      />,
    );

    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    fireEvent.load(screen.getByTestId("app-image"));

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(onLoad).toHaveBeenCalledTimes(1);
  });
});

describe("SuspenseAppImage", () => {
  beforeEach(() => {
    // The suspense wrapper preloads via `new Image()`; jsdom never fires load
    // events for it, so stub a minimal Image that loads asynchronously.
    vi.stubGlobal(
      "Image",
      class FakeImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          setTimeout(() => this.onload?.(), 0);
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("suspends, then renders the image once the preload resolves", async () => {
    render(
      <SuspenseAppImage
        url={ORIGINAL_URL}
        context="lightbox"
        data-testid="app-image"
      />,
    );

    // While suspended the fallback skeleton renders instead of the <img>.
    expect(screen.queryByTestId("app-image")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByTestId("app-image")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("app-image")).toHaveAttribute(
      "src",
      ORIGINAL_URL,
    );
  });

  it("renders the skeleton immediately without suspending when crop is pending", () => {
    render(
      <SuspenseAppImage
        url={ORIGINAL_URL}
        croppedUrl={null}
        crop={{ x: 0.1, y: 0.1, width: 0.8, height: 0.6 }}
        context="gallery"
        data-testid="app-image"
      />,
    );
    // No Suspense boundary entered — the skeleton is returned synchronously.
    expect(screen.queryByTestId("app-image")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("preloads the cropped URL when a materialized crop exists", async () => {
    render(
      <SuspenseAppImage
        url={ORIGINAL_URL}
        croppedUrl={CROPPED_URL}
        context="lightbox"
        data-testid="app-image"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("app-image")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("app-image")).toHaveAttribute(
      "src",
      CROPPED_URL,
    );
  });
});
