import type { Meta, StoryObj } from "@storybook/react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import AppFooterLinks from "../components/AppFooterLinks";

/**
 * AppFooterLinks renders the "About Us · Privacy Policy · Terms of Service"
 * link row shown at the bottom of app pages.
 *
 * Rationale ("Switch support flow to django-helpdesk"):
 * - Originally included an in-app support/contact link backed by a bespoke
 *   support-thread API. That flow was migrated to django-helpdesk (mounted
 *   under `/support/`, linked from the authenticated user dropdown instead),
 *   leaving this component with just the lightweight legal/info links.
 * - `sticky` pins the footer to the viewport bottom with a blurred backdrop —
 *   used on pages (e.g. the public piece showcase) that don't otherwise
 *   scroll far enough to reach a static footer.
 */
const meta = {
  title: "Components/AppFooterLinks",
  component: AppFooterLinks,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AppFooterLinks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Static: Story = {
  args: {
    sticky: false,
  },
};

export const Sticky: Story = {
  args: {
    sticky: true,
  },
  render: (args) => (
    <Box sx={{ height: 240, display: "flex", flexDirection: "column" }}>
      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
        Page content scrolls above; the footer stays pinned to the bottom of
        this container with a blurred backdrop.
      </Typography>
      <AppFooterLinks {...args} />
    </Box>
  ),
};
