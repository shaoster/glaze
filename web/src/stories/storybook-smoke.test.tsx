/**
 * Smoke tests: verify every Storybook story renders without triggering the
 * ErrorBoundary ("Something went wrong. Please reload the page.").
 *
 * Imports StorybookProviders from .storybook/providers.tsx — the same module
 * used by preview.tsx — so that a missing provider in providers.tsx will
 * cause these tests to fail AND break the deployed Storybook simultaneously.
 *
 * ErrorBoundary.Default is excluded because it intentionally triggers the
 * error boundary to demonstrate catch behavior.
 */
import { describe, it, expect, vi } from "vitest";
import { act, render } from "@testing-library/react";
import React from "react";
import { composeStories } from "@storybook/react";
import { StorybookProviders } from "../../.storybook/providers";

// Story modules
import * as AnalysisCardStories from "./AnalysisCard.stories";
import * as AnalysisIndexStories from "./AnalysisIndex.stories";
import * as AutosaveStatusStories from "./AutosaveStatus.stories";
import * as CloudinaryImageStories from "./CloudinaryImage.stories";
import * as CreateTagDialogStories from "./CreateTagDialog.stories";
import * as CropOverlayStories from "./CropOverlay.stories";
import * as DeletePiecePhotoDialogStories from "./DeletePiecePhotoDialog.stories";
import * as EditableToggleStories from "./EditableToggle.stories";
import * as GlazeCombinationGalleryStories from "./GlazeCombinationGallery.stories";
import * as GlazeCombinationSummaryStories from "./GlazeCombinationSummary.stories";
import * as GlobalEntryDialogStories from "./GlobalEntryDialog.stories";
import * as GlobalEntryFieldStories from "./GlobalEntryField.stories";
import * as ImageLightboxStories from "./ImageLightbox.stories";
import * as ImageUploaderStories from "./ImageUploader.stories";
import * as LightboxFooterStories from "./LightboxFooter.stories";
import * as NavigationBlockerStories from "./NavigationBlocker.stories";
import * as NewPieceDialogStories from "./NewPieceDialog.stories";
import * as PieceDetailStories from "./PieceDetail.stories";
import * as PieceHistoryStories from "./PieceHistory.stories";
import * as PieceListStories from "./PieceList.stories";
import * as PieceNameEditorStories from "./PieceNameEditor.stories";
import * as PiecePhotoGalleryStories from "./PiecePhotoGallery.stories";
import * as PiecePhotoGalleryGridStories from "./PiecePhotoGalleryGrid.stories";
import * as PieceShareControlsStories from "./PieceShareControls.stories";
import * as ProcessSummaryStories from "./ProcessSummary.stories";
import * as PublicPieceShellStories from "./PublicPieceShell.stories";
import * as SectionCardStories from "./SectionCard.stories";
import * as ShowcaseVideoInputPickerStories from "./ShowcaseVideoInputPicker.stories";
import * as StateChipStories from "./StateChip.stories";
import * as StateTransitionStories from "./StateTransition.stories";
import * as TagAutocompleteStories from "./TagAutocomplete.stories";
import * as TagChipStories from "./TagChip.stories";
import * as TagChipListStories from "./TagChipList.stories";
import * as TagManagerStories from "./TagManager.stories";
import * as WorkflowStateStories from "./WorkflowState.stories";

const storyGroups: [string, Record<string, React.ComponentType>][] = [
  ["AnalysisCard", composeStories(AnalysisCardStories)],
  ["AnalysisIndex", composeStories(AnalysisIndexStories)],
  ["AutosaveStatus", composeStories(AutosaveStatusStories)],
  ["CloudinaryImage", composeStories(CloudinaryImageStories)],
  ["CreateTagDialog", composeStories(CreateTagDialogStories)],
  ["CropOverlay", composeStories(CropOverlayStories)],
  ["DeletePiecePhotoDialog", composeStories(DeletePiecePhotoDialogStories)],
  ["EditableToggle", composeStories(EditableToggleStories)],
  ["GlazeCombinationGallery", composeStories(GlazeCombinationGalleryStories)],
  ["GlazeCombinationSummary", composeStories(GlazeCombinationSummaryStories)],
  ["GlobalEntryDialog", composeStories(GlobalEntryDialogStories)],
  ["GlobalEntryField", composeStories(GlobalEntryFieldStories)],
  ["ImageLightbox", composeStories(ImageLightboxStories)],
  ["ImageUploader", composeStories(ImageUploaderStories)],
  ["LightboxFooter", composeStories(LightboxFooterStories)],
  ["NavigationBlocker", composeStories(NavigationBlockerStories)],
  ["NewPieceDialog", composeStories(NewPieceDialogStories)],
  ["PieceDetail", composeStories(PieceDetailStories)],
  ["PieceHistory", composeStories(PieceHistoryStories)],
  ["PieceList", composeStories(PieceListStories)],
  ["PieceNameEditor", composeStories(PieceNameEditorStories)],
  ["PiecePhotoGallery", composeStories(PiecePhotoGalleryStories)],
  ["PiecePhotoGalleryGrid", composeStories(PiecePhotoGalleryGridStories)],
  ["PieceShareControls", composeStories(PieceShareControlsStories)],
  ["ProcessSummary", composeStories(ProcessSummaryStories)],
  ["PublicPieceShell", composeStories(PublicPieceShellStories)],
  ["SectionCard", composeStories(SectionCardStories)],
  ["ShowcaseVideoInputPicker", composeStories(ShowcaseVideoInputPickerStories)],
  ["StateChip", composeStories(StateChipStories)],
  ["StateTransition", composeStories(StateTransitionStories)],
  ["TagAutocomplete", composeStories(TagAutocompleteStories)],
  ["TagChip", composeStories(TagChipStories)],
  ["TagChipList", composeStories(TagChipListStories)],
  ["TagManager", composeStories(TagManagerStories)],
  ["WorkflowState", composeStories(WorkflowStateStories)],
];

const allStories: [string, React.ComponentType][] = storyGroups.flatMap(
  ([group, stories]) =>
    Object.entries(stories).map(([name, Story]) => [
      `${group}/${name}`,
      Story as React.ComponentType,
    ]),
);

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
