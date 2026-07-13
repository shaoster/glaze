import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import Button from "@mui/material/Button";
import { fn } from "@storybook/test";
import LargeTutorialInlay from "../components/LargeTutorialInlay";

/**
 * LargeTutorialInlay is a full-screen, multi-page onboarding modal — the
 * "modal" inlay type in the declarative tutorials system.
 *
 * Rationale (Issue #911 — "feat(tutorials): add LargeTutorialInlay modal and
 * extend schema"):
 * - Scaffolded alongside `SmallTutorialInlay` (anchored popovers) so
 *   `tutorials.yml` can declare either an anchored tip or a full walkthrough
 *   modal gated by `route`, dispatched by `TutorialManager` on `inlay.type`.
 * - Internally owns its own page index and "Don't show this again" checkbox
 *   state; callers only supply the page content and two terminal callbacks.
 * - `<em>...</em>` markup inside `title` renders as an italic, muted span
 *   (see `renderTitle`) so tutorial copy can emphasize a word without HTML risk.
 *
 * Edge cases:
 * - First page: no "Back" button.
 * - Last page: the primary button becomes `completeLabel` and calls `onComplete`
 *   instead of `onClose`/advancing.
 * - Bullets are optional per-page — pages can mix prose-only and bulleted content.
 * - Checking "Don't show this again" is passed through to whichever of
 *   `onComplete`/`onClose` fires, so the caller decides how to persist it
 *   (e.g. saving a `false` tutorial preference).
 */
const meta = {
  title: "Components/LargeTutorialInlay",
  component: LargeTutorialInlay,
  parameters: {
    layout: "fullscreen",
    docs: {
      inlineStories: false,
      iframeHeight: 600,
      source: {
        code: `
<LargeTutorialInlay
  pages={pages}
  onComplete={({ dontShow }) => console.log('complete', dontShow)}
  onClose={({ dontShow }) => console.log('close', dontShow)}
/>`,
      },
    },
  },
  tags: ["autodocs"],
  render: (args) => <LargeTutorialInlayWithToggle {...args} />,
} satisfies Meta<typeof LargeTutorialInlay>;

export default meta;
type Story = StoryObj<typeof meta>;

function LargeTutorialInlayWithToggle(
  args: React.ComponentProps<typeof LargeTutorialInlay>,
) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant="contained" onClick={() => setOpen(true)}>
        Open Tutorial
      </Button>
    );
  }
  return (
    <LargeTutorialInlay
      {...args}
      onClose={(opts) => {
        args.onClose(opts);
        setOpen(false);
      }}
      onComplete={(opts) => {
        args.onComplete(opts);
        setOpen(false);
      }}
    />
  );
}

const onboardingPages = [
  {
    title: "Welcome to <em>PotterDoc</em>",
    body: "Track every piece you throw, from wet clay to the final glaze fire, in one place.",
  },
  {
    title: "Log each <em>state</em> as you go",
    body: "PotterDoc's workflow mirrors your studio process — capture notes and photos as a piece moves through it.",
    bullets: [
      "Attach photos at any state",
      "Record glaze combinations and kiln locations",
      "Rewind the timeline to see how a piece looked earlier",
    ],
  },
  {
    title: "Share your <em>finished work</em>",
    body: "Completed pieces get a public showcase page you can send to customers or post online.",
    bullets: ["Custom showcase story", "Optional video embed", "One-click share link"],
  },
];

export const Default: Story = {
  args: {
    pages: onboardingPages,
    onComplete: fn(),
    onClose: fn(),
  },
};

export const SinglePageNoBullets: Story = {
  args: {
    pages: [
      {
        title: "New: <em>Timeline Rewind</em>",
        body: "You can now click any past state on a piece's carousel to view it exactly as it looked at that point in the workflow.",
      },
    ],
    eyebrow: "What's new",
    completeLabel: "Got it",
    onComplete: fn(),
    onClose: fn(),
  },
};

export const CustomEyebrowAndCompleteLabel: Story = {
  args: {
    pages: onboardingPages.slice(0, 2),
    eyebrow: "Glaze Combinations · 2 min",
    completeLabel: "Start logging glazes",
    onComplete: fn(),
    onClose: fn(),
  },
};
