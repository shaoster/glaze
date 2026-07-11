import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { fn } from "@storybook/test";
import { DynamicPreferenceField } from "../components/DynamicPreferenceField";
import type { PreferenceField } from "../util/preferences";
import type { ProcessSummaryFieldOption } from "../util/workflow";

/**
 * DynamicPreferenceField renders a single preference input, dispatched purely
 * on `field.type` — the field-level counterpart to `PREFERENCES_SCHEMA`
 * (driven by `user_preferences.yml`), the same "schema drives the UI"
 * pattern `workflow.yml` uses for per-state forms.
 *
 * Rationale:
 * - Kept prop-driven and context-free on purpose so `UserPreferencesDialog`
 *   can render one per schema field without each field needing its own data
 *   fetching or mutation wiring — the parent owns all form state.
 * - `field-list` groups its options by `option.group` (e.g. "Piece",
 *   "Current State") and renders a `Divider` between groups.
 *
 * Edge cases:
 * - `string`: value is hard-truncated to `field.max_length` on every keystroke.
 * - `boolean`: defaults to `true` when `value` is `undefined` (tutorial
 *   preferences are opt-out, not opt-in).
 * - Unknown `field.type`: renders nothing.
 */
const meta = {
  title: "Components/DynamicPreferenceField",
  component: DynamicPreferenceField,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof DynamicPreferenceField>;

export default meta;
type Story = StoryObj<typeof meta>;

const stringField: PreferenceField = {
  type: "string",
  label: "Alias",
  hint: "How you'd like to identify yourself in the app. Not visible to others.",
  storage: "UserProfile",
  max_length: 50,
};

const booleanField: PreferenceField = {
  type: "boolean",
  label: 'Show the "Change your alias!" tip',
  hint: "Controls the alias guidance shown on the piece list.",
  storage: "UserProfile.preferences",
};

const fieldListField: PreferenceField = {
  type: "field-list",
  label: "Process Summary Fields",
  hint: "Select fields to show. Images excluded.",
  storage: "UserProfile.preferences",
  provider: "workflow_summary_fields",
};

const mockOptions: ProcessSummaryFieldOption[] = [
  { ref: "piece.name", label: "Name", group: "Piece" },
  { ref: "piece.created", label: "Created", group: "Piece" },
  { ref: "current_state.state", label: "Current state", group: "Current State" },
  { ref: "glazed.glaze_combination", label: "Glaze combination", group: "Glazed" },
];

function StringFieldHarness(
  args: React.ComponentProps<typeof DynamicPreferenceField>,
) {
  const [value, setValue] = useState(args.value);
  return <DynamicPreferenceField {...args} value={value} onChange={setValue} />;
}

export const StringInput: Story = {
  args: {
    fieldId: "alias",
    field: stringField,
    value: "clay-wrangler",
    onChange: fn(),
    isSaving: false,
    options: [],
  },
  render: (args) => <StringFieldHarness {...args} />,
};

export const BooleanCheckbox: Story = {
  args: {
    fieldId: "change_alias_prompt",
    field: booleanField,
    value: true,
    onChange: fn(),
    isSaving: false,
    options: [],
  },
  render: (args) => <StringFieldHarness {...args} />,
};

export const FieldListGrouped: Story = {
  args: {
    fieldId: "process_summary_fields",
    field: fieldListField,
    value: ["piece.name", "glazed.glaze_combination"],
    onChange: fn(),
    isSaving: false,
    options: mockOptions,
  },
  render: (args) => <StringFieldHarness {...args} />,
};

export const SavingDisablesInput: Story = {
  args: {
    ...StringInput.args,
    isSaving: true,
  },
  render: (args) => <StringFieldHarness {...args} />,
};
