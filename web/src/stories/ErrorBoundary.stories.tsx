import type { Meta, StoryObj } from "@storybook/react";
import ErrorBoundary from "../components/ErrorBoundary";

/**
 * ErrorBoundary component to catch JavaScript errors anywhere in their child component tree.
 *
 * Rationale: Standardizes error handling across the app to prevent full-page crashes.
 * Displays a fallback UI and logs the error to our logging service (e.g., Sentry or internal API).
 *
 * Edge cases:
 * - Recoverability: Provides a "Retry" or "Home" action to help users get back on track.
 */
const meta = {
  title: "Components/ErrorBoundary",
  component: ErrorBoundary,
  parameters: {
    layout: "centered",
    docs: {
      inlineStories: false,
      iframeHeight: 300,
      canvas: { sourceState: "none" },
      source: { code: null },
    },
  },
  tags: ["autodocs"],
  args: { children: null },
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

const ThrowError = () => {
  throw new Error("Simulated rendering error");
};

export const Default: Story = {
  render: () => (
    <ErrorBoundary>
      <ThrowError />
    </ErrorBoundary>
  ),
};

export const WithChildren: Story = {
  render: () => (
    <ErrorBoundary>
      <div style={{ color: "white" }}>Healthy child component</div>
    </ErrorBoundary>
  ),
};
