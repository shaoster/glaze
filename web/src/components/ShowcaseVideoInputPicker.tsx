import { useMemo } from "react";
import {
  Box,
  Divider,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  Link,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import type { PieceDetail, PieceState } from "../util/types";
import { formatState } from "../util/workflow";
import { DEFAULT_TRACK_ID, MUSIC_CATALOG, getTrack } from "../util/music";
import SelectablePhotoMasonry, {
  type SelectablePhotoItem,
} from "./SelectablePhotoMasonry";

export type ShowcaseVideoInputSelection = {
  excludedImageKeys: string[];
  excludedNoteKeys: string[];
  musicTrackId: string;
};

type ShowcaseVideoInputPickerProps = {
  piece: PieceDetail;
  history?: PieceState[];
  selection: ShowcaseVideoInputSelection;
  onSelectionChange: (selection: ShowcaseVideoInputSelection) => void;
  disabled?: boolean;
};

type ShowcaseImageItem = {
  key: string;
  url: string;
  crop?: PieceDetail["current_state"]["images"][number]["crop"] | null;
  cropped_url?: string | null;
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

function buildImageItems(piece: PieceDetail, history?: PieceState[]): ShowcaseImageItem[] {
  const states = history && history.length > 0 ? history : [...piece.history, piece.current_state];
  const seen = new Set<string>();
  const thumbnailImageId = piece.thumbnail?.image_id ?? null;
  const thumbnailUrl = piece.thumbnail?.url?.trim() || null;
  return states.flatMap((state) => {
    if (seen.has(state.id)) return [];
    seen.add(state.id);
    return state.images.map((image, index) => ({
      key: normalizeKey(state.id, image.image_id ?? String(index)),
      url: image.url,
      crop: image.crop ?? null,
      cropped_url: image.cropped_url ?? null,
      stateLabel: formatState(state.state),
      whenLabel: state.created.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      caption: image.caption?.trim() || "Untitled image",
      required:
        thumbnailImageId && image.image_id
          ? image.image_id === thumbnailImageId
          : !!thumbnailUrl && image.url === thumbnailUrl,
    }));
  });
}

function buildNoteItems(piece: PieceDetail, history?: PieceState[]): ShowcaseNoteItem[] {
  const states = history && history.length > 0 ? history : [...piece.history, piece.current_state];
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
  history,
  selection,
  onSelectionChange,
  disabled = false,
}: ShowcaseVideoInputPickerProps) {
  const imageItems = useMemo(() => buildImageItems(piece, history), [piece, history]);
  const noteItems = useMemo(() => buildNoteItems(piece, history), [piece, history]);

  const includedImages = imageItems.filter(
    (item) => item.required || !selection.excludedImageKeys.includes(item.key),
  ).length;
  const includedNotes = noteItems.length - selection.excludedNoteKeys.length;
  const selectableImages: SelectablePhotoItem[] = imageItems.map((item) => ({
    key: item.key,
    url: item.url,
    crop: item.crop ?? null,
    cropped_url: item.cropped_url ?? null,
    stateLabel: item.stateLabel,
    whenLabel: item.whenLabel,
    checked: item.required || !selection.excludedImageKeys.includes(item.key),
    locked: item.required,
    onToggle: item.required
      ? undefined
      : () =>
          onSelectionChange({
            ...selection,
            excludedImageKeys: toggleValue(selection.excludedImageKeys, item.key),
          }),
  }));

  const selectedTrackId = getTrack(selection.musicTrackId)
    ? selection.musicTrackId
    : DEFAULT_TRACK_ID;
  const selectedTrack = getTrack(selectedTrackId);

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
                          ...selection,
                          excludedNoteKeys: toggleValue(
                            selection.excludedNoteKeys,
                            item.key,
                          ),
                        })
                      }
                      disabled={disabled}
                      inputProps={{
                        "aria-label": `Include note in the video: ${item.stateLabel}`,
                      }}
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
          <SelectablePhotoMasonry
            items={selectableImages}
            emptyLabel="No images are available for this piece."
            disabled={disabled}
          />
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
          Music
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Pick a royalty-free background track for the Keepsake video.
        </Typography>
        <FormControl fullWidth size="small">
          <Select
            value={selectedTrackId}
            disabled={disabled}
            onChange={(event) =>
              onSelectionChange({
                ...selection,
                musicTrackId: event.target.value,
              })
            }
            inputProps={{ "aria-label": "Background music track" }}
          >
            {MUSIC_CATALOG.map((track) => (
              <MenuItem key={track.id} value={track.id}>
                {track.title} — {track.artist}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {selectedTrack && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {selectedTrack.license}
              {selectedTrack.license_url && (
                <>
                  {" · "}
                  <Link
                    href={selectedTrack.license_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    License
                  </Link>
                </>
              )}
            </Typography>
            <Box sx={{ mt: 0.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
              <Typography variant="caption" color="text.secondary">
                {"Platform: "}
                <Link href={selectedTrack.source_url} target="_blank" rel="noopener noreferrer">
                  Audio Library
                </Link>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {"Artist: "}
                <Link href={selectedTrack.artist_url} target="_blank" rel="noopener noreferrer">
                  {selectedTrack.artist}
                </Link>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {"Song: "}
                <Link
                  href={selectedTrack.download_url || selectedTrack.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {selectedTrack.title}
                </Link>
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      <Divider />

      <Typography variant="caption" color="text.secondary">
        Exclusions affect the effective video inputs and will later drive
        regeneration detection.
      </Typography>
    </Stack>
  );
}
