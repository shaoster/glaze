import { useMemo } from "react";
import {
  Box,
  Checkbox,
  Divider,
  FormControlLabel,
  FormGroup,
  Stack,
  Typography,
} from "@mui/material";
import type { PieceDetail } from "../util/types";
import { formatState } from "../util/workflow";

export type ShowcaseVideoInputSelection = {
  excludedImageKeys: string[];
  excludedNoteKeys: string[];
};

type ShowcaseVideoInputPickerProps = {
  piece: PieceDetail;
  selection: ShowcaseVideoInputSelection;
  onSelectionChange: (selection: ShowcaseVideoInputSelection) => void;
  disabled?: boolean;
};

type ShowcaseImageItem = {
  key: string;
  url: string;
  stateLabel: string;
  whenLabel: string;
  caption: string;
  required: boolean;
};

type ShowcaseNoteItem = {
  key: string;
  stateLabel: string;
  note: string;
};

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

function normalizeKey(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(":");
}

function buildImageItems(piece: PieceDetail): ShowcaseImageItem[] {
  const states = [...piece.history, piece.current_state];
  const seen = new Set<string>();
  const thumbnailPublicId = piece.thumbnail?.cloudinary_public_id?.trim() || null;
  return states.flatMap((state) => {
    if (seen.has(state.id)) return [];
    seen.add(state.id);
    return state.images.map((image, index) => ({
      key: normalizeKey(
        state.id,
        image.image_id ?? image.cloudinary_public_id ?? String(index),
      ),
      url: image.url,
      stateLabel: formatState(state.state),
      whenLabel: state.created.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      caption: image.caption?.trim() || "Untitled image",
      required: !!thumbnailPublicId && image.cloudinary_public_id === thumbnailPublicId,
    }));
  });
}

function buildNoteItems(piece: PieceDetail): ShowcaseNoteItem[] {
  const states = [...piece.history, piece.current_state];
  const seen = new Set<string>();
  return states
    .map((state) => {
      if (seen.has(state.id)) return null;
      seen.add(state.id);
      return {
        key: state.id,
        stateLabel: formatState(state.state),
        note: state.notes.trim(),
      };
    })
    .filter((entry): entry is ShowcaseNoteItem => !!entry && entry.note.length > 0);
}

export default function ShowcaseVideoInputPicker({
  piece,
  selection,
  onSelectionChange,
  disabled = false,
}: ShowcaseVideoInputPickerProps) {
  const imageItems = useMemo(() => buildImageItems(piece), [piece]);
  const noteItems = useMemo(() => buildNoteItems(piece), [piece]);

  const includedImages = imageItems.filter(
    (item) => item.required || !selection.excludedImageKeys.includes(item.key),
  ).length;
  const includedNotes = noteItems.length - selection.excludedNoteKeys.length;

  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Video inputs
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Included by default. Remove any images or notes you do not want used in
          the Keepsake video.
        </Typography>
      </Box>

      <Box
        sx={(theme) => ({
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          p: 1.5,
          backgroundColor: theme.palette.background.paper,
        })}
      >
        <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
          Notes
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {includedNotes} of {noteItems.length} note entries will be used
        </Typography>
        <FormGroup>
          {noteItems.length > 0 ? (
            noteItems.map((item) => {
              const checked = !selection.excludedNoteKeys.includes(item.key);
              return (
                <FormControlLabel
                  key={item.key}
                  control={
                    <Checkbox
                      checked={checked}
                      onChange={() =>
                        onSelectionChange({
                          excludedImageKeys: selection.excludedImageKeys,
                          excludedNoteKeys: toggleValue(
                            selection.excludedNoteKeys,
                            item.key,
                          ),
                        })
                      }
                      disabled={disabled}
                    />
                  }
                  label={
                    <Stack spacing={0.25} sx={{ py: 0.25 }}>
                      <Typography variant="body2">{item.stateLabel}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.note}
                      </Typography>
                    </Stack>
                  }
                />
              );
            })
          ) : (
            <Typography variant="body2" color="text.secondary">
              No notes are available for this piece.
            </Typography>
          )}
        </FormGroup>
      </Box>

      <Box
        sx={(theme) => ({
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          p: 1.5,
          backgroundColor: theme.palette.background.paper,
        })}
      >
        <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
          Choose video frames
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {includedImages} of {imageItems.length} frames will be used
        </Typography>
        <FormGroup>
          {imageItems.length > 0 ? (
            imageItems.map((item) => {
              const checked = item.required || !selection.excludedImageKeys.includes(item.key);
              return (
                <FormControlLabel
                  key={item.key}
                  sx={{
                    alignItems: "flex-start",
                    ml: 0,
                    mb: 1,
                    px: 1,
                    py: 1,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: checked ? "primary.main" : "divider",
                    backgroundColor: checked ? "action.hover" : "background.paper",
                  }}
                  control={
                    <Checkbox
                      checked={checked}
                      onChange={
                        item.required
                          ? undefined
                          : () =>
                              onSelectionChange({
                                excludedImageKeys: toggleValue(
                                  selection.excludedImageKeys,
                                  item.key,
                                ),
                                excludedNoteKeys: selection.excludedNoteKeys,
                              })
                      }
                      disabled={disabled || item.required}
                    />
                  }
                  label={
                    <Stack spacing={0.75} sx={{ py: 0.25, width: "100%" }}>
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: "92px 1fr",
                          gap: 1,
                          alignItems: "start",
                        }}
                      >
                        <Box
                          component="img"
                          src={item.url}
                          alt={item.caption}
                          sx={{
                            width: 92,
                            height: 66,
                            borderRadius: 1.5,
                            objectFit: "cover",
                            border: "1px solid",
                            borderColor: "divider",
                            backgroundColor: "action.selected",
                          }}
                        />
                        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {item.stateLabel}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.whenLabel}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                            {item.caption}
                          </Typography>
                          {item.required ? (
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                              Locked as the video cover
                            </Typography>
                          ) : null}
                        </Stack>
                      </Box>
                    </Stack>
                  }
                />
              );
            })
          ) : (
            <Typography variant="body2" color="text.secondary">
              No images are available for this piece.
            </Typography>
          )}
        </FormGroup>
      </Box>

      <Divider />

      <Typography variant="caption" color="text.secondary">
        Exclusions affect the effective video inputs and will later drive
        regeneration detection.
      </Typography>
    </Stack>
  );
}
