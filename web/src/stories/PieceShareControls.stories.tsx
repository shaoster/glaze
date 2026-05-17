import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import ShareControls from "../components/PieceShareControls";
import type { PieceDetail } from "../util/types";

const basePiece: PieceDetail = {
  id: "abc123",
  name: "Celadon Bowl",
  notes: "",
  shared: false,
  is_editable: false,
  can_edit: true,
  tags: [],
  showcase_fields: [],
  showcase_story: "",
  thumbnail: null,
  current_state: {
    id: "s1",
    state: "completed",
    notes: "",
    images: [],
    custom_fields: {},
    has_been_edited: false,
    created: new Date("2025-01-01"),
    last_modified: new Date("2025-01-02"),
  },
  history: [],
  fields_last_modified: new Date("2025-01-02"),
  created: new Date("2025-01-01"),
};

const meta = {
  title: "Components/PieceShareControls",
  component: ShareControls,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { onPieceUpdated: fn() },
} satisfies Meta<typeof ShareControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotShared: Story = {
  args: { piece: basePiece },
};

export const Shared: Story = {
  args: { piece: { ...basePiece, shared: true } },
};
