import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProcessSummary from "../ProcessSummary";
import {
  CurrentUserProvider,
  PreferencesDialogProvider,
} from "../CurrentUserContext";
import type { PieceDetail } from "../../util/types";

function makePiece(
  overrides: Partial<PieceDetail> = {},
  historyOverrides: Array<Record<string, unknown>> = [],
): PieceDetail {
  const history = historyOverrides.length
    ? historyOverrides
    : [
        {
          state: "completed",
          notes: "",
          images: [],
          custom_fields: {},
          created: new Date("2026-01-01T00:00:00Z"),
          last_modified: new Date("2026-01-01T00:00:00Z"),
        },
      ];
  return {
    id: "piece-1",
    name: "Test Bowl",
    created: new Date("2026-01-01T00:00:00Z"),
    last_modified: new Date("2026-01-01T00:00:00Z"),
    thumbnail: null,
    shared: false,
    is_editable: false,
    can_edit: true,
    current_state: history[history.length - 1] as PieceDetail["current_state"],
    current_location: "",
    tags: [],
    showcase_story: "",
    showcase_fields: [],
    history,
    ...overrides,
  };
}

describe("ProcessSummary", () => {
  it("renders direct values, computed values, and conditional text", () => {
    const history = [
      {
        state: "wheel_thrown",
        notes: "",
        images: [],
        custom_fields: {
          clay_weight_lbs: 4,
          clay_body: { id: "clay-1", name: "Speckled Buff" },
        },
        created: new Date("2026-01-01T00:00:00Z"),
        last_modified: new Date("2026-01-01T00:00:00Z"),
      },
      {
        state: "trimmed",
        notes: "",
        images: [],
        custom_fields: { trimmed_weight_lbs: 3.25 },
        created: new Date("2026-01-01T00:00:00Z"),
        last_modified: new Date("2026-01-01T00:00:00Z"),
      },
      {
        state: "submitted_to_bisque_fire",
        notes: "",
        images: [],
        custom_fields: {
          length_in: 6,
          width_in: 3,
          height_in: 2,
        },
        created: new Date("2026-01-01T00:00:00Z"),
        last_modified: new Date("2026-01-01T00:00:00Z"),
      },
      {
        state: "completed",
        notes: "",
        images: [],
        custom_fields: {},
        created: new Date("2026-01-01T00:00:00Z"),
        last_modified: new Date("2026-01-01T00:00:00Z"),
      },
    ] as PieceDetail["history"];

    render(
      <ProcessSummary piece={makePiece({}, history)} history={history} />,
    );

    expect(screen.getByText("Making")).toBeInTheDocument();
    expect(screen.getByText("Starting weight")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Clay body")).toBeInTheDocument();
    expect(screen.getByText("Speckled Buff")).toBeInTheDocument();
    expect(screen.getByText("Trimming loss")).toBeInTheDocument();
    expect(screen.getByText("0.75 lb")).toBeInTheDocument();
    expect(screen.getByText("Wax resist")).toBeInTheDocument();
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
    expect(screen.getByText("Dimensions total")).toBeInTheDocument();
    expect(screen.getByText("11 in")).toBeInTheDocument();
    expect(screen.getByText("Approximate volume")).toBeInTheDocument();
    expect(screen.getByText("36 cu in")).toBeInTheDocument();
    expect(screen.getByText("Length to width ratio")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("honors state_exists and state_missing visibility", () => {
    render(
      <ProcessSummary
        piece={makePiece()}
        history={[
          {
            state: "wheel_thrown",
            notes: "",
            images: [],
            custom_fields: { clay_weight_lbs: 4 },
            created: new Date("2026-01-01T00:00:00Z"),
            last_modified: new Date("2026-01-01T00:00:00Z"),
          },
          {
            state: "trimmed",
            notes: "",
            images: [],
            custom_fields: { trimmed_weight_lbs: 3.25 },
            created: new Date("2026-01-01T00:00:00Z"),
            last_modified: new Date("2026-01-01T00:00:00Z"),
          },
          {
            state: "waxed",
            notes: "",
            images: [],
            custom_fields: {},
            created: new Date("2026-01-01T00:00:00Z"),
            last_modified: new Date("2026-01-01T00:00:00Z"),
          },
          {
            state: "completed",
            notes: "",
            images: [],
            custom_fields: {},
            created: new Date("2026-01-01T00:00:00Z"),
            last_modified: new Date("2026-01-01T00:00:00Z"),
          },
        ]}
      />,
    );

    expect(screen.queryByText("Not recorded")).not.toBeInTheDocument();
    expect(screen.getByText("Applied")).toBeInTheDocument();
  });

  it("uses the latest matching state value and hides empty sections", () => {
    const { container } = render(
      <ProcessSummary
        piece={makePiece()}
        history={[
          {
            state: "wheel_thrown",
            notes: "",
            images: [],
            custom_fields: { clay_weight_lbs: 4 },
            created: new Date("2026-01-01T00:00:00Z"),
            last_modified: new Date("2026-01-01T00:00:00Z"),
          },
          {
            state: "wheel_thrown",
            notes: "",
            images: [],
            custom_fields: { clay_weight_lbs: 5.5 },
            created: new Date("2026-01-01T00:00:00Z"),
            last_modified: new Date("2026-01-01T00:00:00Z"),
          },
          {
            state: "completed",
            notes: "",
            images: [],
            custom_fields: {},
            created: new Date("2026-01-01T00:00:00Z"),
            last_modified: new Date("2026-01-01T00:00:00Z"),
          },
        ]}
      />,
    );

    expect(screen.getByText("5.5")).toBeInTheDocument();
    expect(screen.queryByText("Trimming loss")).not.toBeInTheDocument();
    expect(container).not.toBeEmptyDOMElement();
  });

  it("renders selected fields from user preferences", () => {
    render(
      <CurrentUserProvider
        currentUser={{
          id: 1,
          is_staff: false,
          openid_subject: "",
            preferences: {
              process_summary_fields: ["piece.name", "wheel_thrown.clay_weight_lbs"],
              summary_customize_popover: true,
                change_alias_prompt: true,
            },
        }}
        >
        <ProcessSummary
          piece={makePiece()}
          history={[
            {
              state: "wheel_thrown",
              notes: "",
              images: [],
              custom_fields: { clay_weight_lbs: 4 },
              created: new Date("2026-01-01T00:00:00Z"),
              last_modified: new Date("2026-01-01T00:00:00Z"),
            },
            {
              state: "completed",
              notes: "",
              images: [],
              custom_fields: {},
              created: new Date("2026-01-01T00:00:00Z"),
              last_modified: new Date("2026-01-01T00:00:00Z"),
            },
          ]}
        />
      </CurrentUserProvider>,
    );

    expect(screen.getByText("Piece")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Test Bowl")).toBeInTheDocument();
    expect(screen.getByText("Thrown")).toBeInTheDocument();
    expect(screen.getByText("Clay Weight Lbs")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByText("Making")).not.toBeInTheDocument();
  });

  it("shows an empty state with a link to the summary field selector", async () => {
    const openPreferencesDialog = vi.fn();
    const saveUserPreferences = vi.fn().mockResolvedValue({
      process_summary_fields: ["piece.current_location"],
      summary_customize_popover: false,
        change_alias_prompt: true,
    });

    render(
      <PreferencesDialogProvider
        openPreferencesDialog={openPreferencesDialog}
        saveUserPreferences={saveUserPreferences}
      >
        <CurrentUserProvider
          currentUser={{
            id: 1,
            is_staff: false,
            openid_subject: "",
            preferences: {
              process_summary_fields: ["piece.current_location"],
              summary_customize_popover: true,
                change_alias_prompt: true,
            },
          }}
        >
          <ProcessSummary
            piece={makePiece({ current_location: "" })}
            history={[
              {
                state: "completed",
                notes: "",
                images: [],
                custom_fields: {},
                created: new Date("2026-01-01T00:00:00Z"),
                last_modified: new Date("2026-01-01T00:00:00Z"),
              },
            ]}
          />
        </CurrentUserProvider>
      </PreferencesDialogProvider>,
    );

    expect(
      screen.getByText("No selected summary fields have values for this piece."),
    ).toBeInTheDocument();
    screen.getByRole("button", { name: "Choose summary fields" }).click();
    expect(openPreferencesDialog).toHaveBeenCalledWith("process-summary");
    expect(screen.queryByText("Making")).not.toBeInTheDocument();
  });
});
