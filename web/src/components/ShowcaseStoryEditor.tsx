import { useEffect, useState } from "react";
import { Box, TextField, Typography } from "@mui/material";
import type { PieceDetail } from "../util/types";
import { updatePiece } from "../util/api";
import { useAutosave } from "./useAutosave";
import AutosaveStatus from "./AutosaveStatus";
import SectionCard from "./SectionCard";

type ShowcaseStoryEditorProps = {
  piece: PieceDetail;
  onPieceUpdated: (updated: PieceDetail) => void;
};

/** Renders the Showcase section (story textarea + fields placeholder) for terminal-state pieces. */
export default function ShowcaseStoryEditor({
  piece,
  onPieceUpdated,
}: ShowcaseStoryEditorProps) {
  const [showcaseStoryValue, setShowcaseStoryValue] = useState(
    piece.showcase_story ?? "",
  );

  // Sync local draft to parent when the prop changes (e.g. an optimistic update
  // arrives from the server). The rule flags synchronous setState in effects, but
  // this is the correct "derived state from prop" pattern here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowcaseStoryValue(piece.showcase_story ?? "");
  }, [piece.showcase_story]);

  const { status: showcaseAutosaveStatus } = useAutosave({
    dirty: showcaseStoryValue !== (piece.showcase_story ?? ""),
    saveKey: `piece-${piece.id}-showcase-story`,
    save: async () => {
      const updated = await updatePiece(piece.id, {
        showcase_story: showcaseStoryValue,
      });
      onPieceUpdated(updated);
    },
  });

  return (
    <SectionCard title="Showcase">
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 1,
            }}
          >
            <Typography variant="subtitle2">Showcase Story</Typography>
            <AutosaveStatus status={showcaseAutosaveStatus} />
          </Box>
          <TextField
            multiline
            fullWidth
            rows={4}
            placeholder="Tell the story of this piece..."
            value={showcaseStoryValue}
            onChange={(e) => setShowcaseStoryValue(e.target.value)}
          />
        </Box>
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Showcase Fields
          </Typography>
          <Typography variant="body2" color="text.secondary">
            TODO: Showcase Field Selection
          </Typography>
        </Box>
      </Box>
    </SectionCard>
  );
}
