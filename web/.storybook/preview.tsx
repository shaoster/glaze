import type { Preview } from "@storybook/react-vite";
import React, { useLayoutEffect, useState } from "react";
import { initialize, mswLoader } from "msw-storybook-addon";
import { themes } from "@storybook/theming";
import { useGlobals } from "@storybook/preview-api";
import { StorybookProviders } from "./providers";

// Initialize MSW
initialize({
  onUnhandledRequest: "bypass",
  serviceWorker: {
    url: window.location.pathname.startsWith("/glaze/storybook")
      ? "/glaze/storybook/mockServiceWorker.js"
      : "/mockServiceWorker.js",
  },
});

type LayoutMode = "desktop" | "mobile";

const VIEWPORTS: Record<LayoutMode, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const MAX_WIDTH_RE = /\(\s*max-width:\s*(\d+(?:\.\d+)?)px\s*\)/i;
const MIN_WIDTH_RE = /\(\s*min-width:\s*(\d+(?:\.\d+)?)px\s*\)/i;

function createMatchMedia(width: number) {
  return (query: string): MediaQueryList => {
    const maxMatch = query.match(MAX_WIDTH_RE);
    const minMatch = query.match(MIN_WIDTH_RE);
    const matchesMax = maxMatch ? width <= Number(maxMatch[1]) : true;
    const matchesMin = minMatch ? width >= Number(minMatch[1]) : true;
    const matches = matchesMax && matchesMin;

    return {
      matches,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    } as MediaQueryList;
  };
}

function applyPreviewViewport(mode: LayoutMode) {
  const viewport = VIEWPORTS[mode];
  const previousInnerWidth = window.innerWidth;
  const previousInnerHeight = window.innerHeight;
  const previousMatchMedia = window.matchMedia;

  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: viewport.width,
    writable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: viewport.height,
    writable: true,
  });
  window.matchMedia = createMatchMedia(viewport.width);
  window.dispatchEvent(new Event("resize"));

  return () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: previousInnerWidth,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: previousInnerHeight,
      writable: true,
    });
    window.matchMedia = previousMatchMedia;
    window.dispatchEvent(new Event("resize"));
  };
}

const preview: Preview = {
  globalTypes: {
    layoutMode: {
      description: "Toggle between desktop and mobile preview sizes.",
      defaultValue: "desktop",
      toolbar: {
        icon: "mobile",
        dynamicTitle: true,
        items: [
          { value: "desktop", title: "Desktop" },
          { value: "mobile", title: "Mobile" },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      const [{ layoutMode }] = useGlobals();
      const [viewportReady, setViewportReady] = useState(false);

      useLayoutEffect(() => {
        const cleanup = applyPreviewViewport(
          (layoutMode as LayoutMode) ?? "desktop",
        );
        setViewportReady(true);
        return () => {
          cleanup();
          setViewportReady(false);
        };
      }, [layoutMode]);

      if (!viewportReady) return null;

      return (
        <StorybookProviders skipRouter={!!context.parameters.noGlobalRouter}>
          <Story />
        </StorybookProviders>
      );
    },
  ],
  loaders: [mswLoader],
  parameters: {
    docs: {
      theme: themes.dark,
      source: {
        type: "dynamic",
        excludeDecorators: true,
      },
    },
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "#211b19" }],
    },
  },
};

export default preview;
