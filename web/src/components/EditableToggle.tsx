import { Box, Button, Tooltip, Typography } from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import LockIcon from "@mui/icons-material/Lock";
import type { PieceDetail } from "../util/types";
import { updatePiece, extractErrorMessage } from "../util/api";
import { useAsyncFn } from "../util/useAsync";
import { validateHistorySequence } from "../util/workflow";

type EditableToggleProps = {
  piece: PieceDetail;
  onPieceUpdated: (updated: PieceDetail) => void;
};

/**
 * Toggle that flips `is_editable` on a piece, allowing the owner to open or
 * seal the piece's history. Disabled when the piece is publicly shared or when
 * the history sequence has a validation error.
 */
export default function EditableToggle({ piece, onPieceUpdated }: EditableToggleProps) {
  const {
    execute: toggle,
    loading: saving,
    error: rawError,
  } = useAsyncFn(async () => {
    const updated = await updatePiece(piece.id, {
      is_editable: !piece.is_editable,
    });
    onPieceUpdated(updated);
  }, [piece.id, piece.is_editable, onPieceUpdated]);

  const error = rawError ? extractErrorMessage(rawError) : null;
  const seqError = piece.is_editable
    ? validateHistorySequence(piece.history)
    : null;

  const disabledReason = piece.shared
    ? "This piece is publicly shared. Unshare it to edit history."
    : null;

  return (
    <Box>
      <Tooltip
        title={disabledReason || ""}
        disableHoverListener={!disabledReason}
        arrow
      >
        <span>
          {piece.is_editable ? (
            <Button
              variant="contained"
              size="small"
              startIcon={<LockIcon fontSize="small" />}
              onClick={toggle}
              disabled={saving || !!seqError}
            >
              Seal changes
            </Button>
          ) : (
            <Button
              variant="outlined"
              size="small"
              startIcon={<HistoryIcon fontSize="small" />}
              onClick={toggle}
              disabled={saving || !!disabledReason}
              sx={{ borderStyle: "dashed", color: "text.secondary" }}
            >
              Edit piece history
            </Button>
          )}
        </span>
      </Tooltip>
      {disabledReason && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            ml: { sm: 1.5 },
            mt: { xs: 0.5, sm: 0 },
            display: { xs: "block", sm: "inline-block" },
            verticalAlign: "middle",
          }}
        >
          {disabledReason}
        </Typography>
      )}
      {seqError && (
        <Typography variant="caption" color="error" sx={{ ml: 1 }}>
          {seqError}
        </Typography>
      )}
      {error && (
        <Typography variant="caption" color="error" sx={{ ml: 1 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
