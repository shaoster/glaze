import { useState, useCallback, useEffect } from "react";
import {
  Box,
  Button,
  Snackbar,
  Typography,
} from "@mui/material";
import type { PieceDetail, TagEntry } from "../util/types";
import { createTagEntry, fetchGlobalEntries, updatePiece } from "../util/api";
import { useAsync } from "../util/useAsync";
import TagAutocomplete from "./TagAutocomplete";
import CreateTagDialog from "./CreateTagDialog";
import TagChipList from "./TagChipList";
import { pickDefaultTagColor } from "./tagPalette";
import { usePieceDetailSaveStatus } from "./usePieceDetailSaveStatus";

const DUPLICATE_TAG_ERROR =
  "A tag with that name already exists. Choose the existing tag or enter a different name.";
const TAG_ATTACH_SNACKBAR_ERROR =
  "Failed to attach the selected tag. Please check your connection and try again.";

type TagManagerProps = {
  pieceId: string;
  initialTags: TagEntry[];
  onSaved: (updated: PieceDetail) => void;
};

function toTagEntry(entry: {
  id: string;
  name: string;
  color?: string | null;
  isPublic: boolean;
}): TagEntry {
  return {
    id: entry.id,
    name: entry.name,
    color: entry.color ?? "",
    is_public: entry.isPublic,
  };
}

export default function TagManager({
  pieceId,
  initialTags,
  onSaved,
}: TagManagerProps) {
  const fetchTags = useCallback(() => fetchGlobalEntries("tag"), []);
  const pieceDetailSaveStatus = usePieceDetailSaveStatus();
  const [shouldLoadTags, setShouldLoadTags] = useState(false);
  const {
    data: rawAvailableTags,
    error: tagsLoadError,
    setData: setRawAvailableTags,
  } = useAsync(fetchTags, [], { enabled: shouldLoadTags });
  const availableTags: TagEntry[] = (rawAvailableTags ?? []).map(toTagEntry);

  const [selectedTags, setSelectedTags] = useState<TagEntry[]>(initialTags);
  const [editingTags, setEditingTags] = useState(false);
  const [draftTags, setDraftTags] = useState<TagEntry[]>(initialTags);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(
    pickDefaultTagColor(initialTags.length),
  );
  const [tagSaving, setTagSaving] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagAttachSnackbarOpen, setTagAttachSnackbarOpen] = useState(false);

  // Sync with parent when piece.tags changes externally (e.g. after a transition)
  useEffect(() => {
    setSelectedTags(initialTags);
    setDraftTags(initialTags);
    setEditingTags(false);
  }, [initialTags]);

  function startEditingTags() {
    if (!shouldLoadTags) {
      setShouldLoadTags(true);
    }
    setDraftTags(selectedTags);
    setTagError(null);
    setEditingTags(true);
  }

  async function saveTags(nextTags: TagEntry[]) {
    setTagSaving(true);
    try {
      const saveTagsRequest = () =>
        updatePiece(pieceId, {
          tags: nextTags.map((tag) => tag.id),
        });
      const updated = pieceDetailSaveStatus
        ? await pieceDetailSaveStatus.runManualSave(saveTagsRequest)
        : await saveTagsRequest();
      setSelectedTags(nextTags);
      onSaved(updated);
      setEditingTags(false);
    } catch {
      setDraftTags(selectedTags);
      setTagAttachSnackbarOpen(true);
    } finally {
      setTagSaving(false);
    }
  }

  async function createTag() {
    const trimmed = newTagName.trim();
    if (!trimmed) {
      setTagError("Tag name cannot be empty.");
      return;
    }
    const normalizedName = trimmed.toLocaleLowerCase();
    if (
      availableTags.some(
        (tag) => tag.name.trim().toLocaleLowerCase() === normalizedName,
      )
    ) {
      setTagError(DUPLICATE_TAG_ERROR);
      return;
    }
    setTagSaving(true);
    setTagError(null);
    try {
      const created = await createTagEntry({
        name: trimmed,
        color: newTagColor,
      });
      setRawAvailableTags((prev) => [
        ...(prev ?? []),
        {
          id: created.id,
          name: created.name,
          color: created.color,
          isPublic: false,
        },
      ]);
      const createdTag: TagEntry = {
        id: created.id,
        name: created.name,
        color: created.color,
        is_public: false, // New tags are private by default.
      };
      setDraftTags((prev) => [...prev, createdTag]);
      setTagDialogOpen(false);
      setNewTagName("");
      setNewTagColor(pickDefaultTagColor(trimmed.length));
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;
      if (status === 400) {
        setTagError(DUPLICATE_TAG_ERROR);
      } else {
        setTagError("Failed to create tag. Please try again.");
      }
    } finally {
      setTagSaving(false);
    }
  }

  return (
    <Box sx={{ flexBasis: "100%" }}>
      {tagsLoadError && (
        <Typography variant="body2" color="error">
          Failed to load tags.
        </Typography>
      )}
      {editingTags ? (
        <Box sx={{ mb: 2 }}>
          <TagAutocomplete
            label="Tags"
            options={availableTags}
            value={draftTags}
            onChange={setDraftTags}
            onCreateNew={() => setTagDialogOpen(true)}
            disabled={tagSaving}
            sx={{ minWidth: 0 }}
          />
          <Button
            variant="contained"
            size="small"
            onClick={() => void saveTags(draftTags)}
            disabled={tagSaving}
            aria-label="Save tags"
            sx={{ mt: 1 }}
          >
            Save
          </Button>
        </Box>
      ) : (
        <Box
          sx={{
            mb: 0.25,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 0.75,
          }}
        >
          {selectedTags.length > 0 && <TagChipList tags={selectedTags} />}
          <Box
            component="button"
            type="button"
            onClick={startEditingTags}
            disabled={tagSaving}
            aria-label="Add or edit tags"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              py: 0.375,
              background: "transparent",
              border: "1px dashed",
              borderColor: "divider",
              borderRadius: "4px",
              cursor: "pointer",
              color: "text.secondary",
              fontFamily: "inherit",
              fontSize: "0.75rem",
            }}
          >
            + tag
          </Box>
        </Box>
      )}

      <CreateTagDialog
        open={tagDialogOpen}
        name={newTagName}
        color={newTagColor}
        error={tagError}
        saving={tagSaving}
        onClose={() => setTagDialogOpen(false)}
        onNameChange={setNewTagName}
        onColorChange={setNewTagColor}
        onCreate={() => void createTag()}
      />
      <Snackbar
        open={tagAttachSnackbarOpen}
        autoHideDuration={4000}
        onClose={(_event, reason) => {
          if (reason === "clickaway") return;
          setTagAttachSnackbarOpen(false);
        }}
        message={TAG_ATTACH_SNACKBAR_ERROR}
      />
    </Box>
  );
}
