import type { Meta, StoryObj } from "@storybook/react-vite";
import ProcessSummary from "../components/ProcessSummary";
import type { PieceState } from "../util/types";

// Minimal history simulating the typical pottery workflow:
// designed → trimmed → bisque_fired → glazed → glaze_fired → completed
const history: PieceState[] = [
  {
    id: "s1",
    state: "designed",
    notes: "Planning a celadon bowl",
    images: [],
    custom_fields: { clay_type: "porcelain", weight_grams: 500 },
    has_been_edited: false,
    created: new Date("2025-01-01"),
    last_modified: new Date("2025-01-01"),
  },
  {
    id: "s2",
    state: "bisque_fired",
    notes: "",
    images: [],
    custom_fields: { kiln_temperature: 1000 },
    has_been_edited: false,
    created: new Date("2025-01-10"),
    last_modified: new Date("2025-01-10"),
  },
  {
    id: "s3",
    state: "glaze_fired",
    notes: "",
    images: [],
    custom_fields: { kiln_temperature: 1260, weight_grams: 460 },
    has_been_edited: false,
    created: new Date("2025-01-20"),
    last_modified: new Date("2025-01-20"),
  },
];

const meta = {
  title: "Components/ProcessSummary",
  component: ProcessSummary,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof ProcessSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithHistory: Story = {
  args: { history },
};

export const EmptyHistory: Story = {
  args: { history: [] },
};
