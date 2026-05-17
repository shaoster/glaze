import type { Meta, StoryObj } from "@storybook/react";
import ErrorBoundary from "../components/ErrorBoundary";

/**
 * ErrorBoundary component to catch JavaScript errors anywhere in their child component tree.
 *
 * Rationale: Standardizes error handling across the app to prevent full-page crashes.
 * Displays a fallback UI and logs the error to our logging service (e.g., Sentry or internal API).
 *
 * Edge cases:
 * - Render errors: Catches errors during the render phase of children.
 * - Lifecycle errors: Catches errors in `componentDidMount` and `componentDidUpdate`.
 * - Recoverability: Provides a "Retry" or "Home" action to help users get back on track.
 */
const meta = {
  title: "Components/ErrorBoundary",
  component: ErrorBoundary,
  parameters: { layout: "centered" },
  args: { children: null },
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

// Renders the error fallback by forcing hasError=true via initial state override.
// Storybook can't trigger React error boundary catches in stories, so we render
// a child that throws to exercise the getDerivedStateFromError path.
function ThrowOnRender(): null {
  throw new Error("Simulated render error");
}

export const WithError: Story = {
  render: () => (
    <ErrorBoundary>
      <ThrowOnRender />
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
