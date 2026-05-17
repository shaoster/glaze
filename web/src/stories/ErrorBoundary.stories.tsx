import type { Meta, StoryObj } from "@storybook/react-vite";
import ErrorBoundary from "../components/ErrorBoundary";

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
