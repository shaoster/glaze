/**
 * Smoke tests: verify every Storybook story renders without triggering the
 * ErrorBoundary ("Something went wrong. Please reload the page.").
 *
 * Uses import.meta.glob to auto-discover all *.stories.tsx files — new stories
 * are picked up automatically without editing this file.
 *
 * Imports StorybookProviders from .storybook/providers.tsx — the same module
 * used by preview.tsx — so that a missing provider in providers.tsx will
 * cause these tests to fail AND break the deployed Storybook simultaneously.
 *
 * ErrorBoundary stories are excluded: they intentionally trigger the error
 * boundary to demonstrate catch behavior.
 */
import { describe, it, expect, vi } from "vitest";
import { act, render } from "@testing-library/react";
import React from "react";
import { composeStories } from "@storybook/react";
import type { Meta, StoryObj } from "@storybook/react";
import { StorybookProviders } from "../../.storybook/providers";

type AnyMeta = Meta<object>;
type StoryModule = { default: AnyMeta } & Record<string, StoryObj<AnyMeta>>;

const storyModules = import.meta.glob<StoryModule>("./*.stories.tsx", {
  eager: true,
});

const allStories: [string, React.ComponentType][] = Object.entries(storyModules)
  .filter(([path]) => !path.includes("ErrorBoundary"))
  .flatMap(([path, module]) => {
    const group = path.replace(/^\.\//, "").replace(/\.stories\.tsx$/, "");
    const composed = composeStories(module);
    return Object.entries(composed).map(([name, Story]) => [
      `${group}/${name}`,
      Story as React.ComponentType,
    ]);
  });

describe("Storybook smoke tests — no story should trigger ErrorBoundary", () => {
  it.each(allStories)("%s renders without error boundary", async (_, Story) => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    let container: HTMLElement;
    try {
      await act(async () => {
        ({ container } = render(
          <StorybookProviders>
            <Story />
          </StorybookProviders>,
        ));
      });
    } finally {
      consoleSpy.mockRestore();
    }
    expect(container!.textContent).not.toContain(
      "Something went wrong. Please reload the page.",
    );
  });
});
