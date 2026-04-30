import { useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import {
  Box,
  CircularProgress,
  Fab,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { fetchPieces } from "../util/api";
import { useAsync } from "../util/useAsync";
import NewPieceDialog from "../components/NewPieceDialog";
import PieceList from "../components/PieceList";
import type { PieceDetail, PieceSummary } from "../util/types";

export default function PieceListPage() {
  const {
    data: pieces,
    loading,
    error,
    setData: setPieces,
  } = useAsync<PieceSummary[]>(fetchPieces);
  const [dialogOpen, setDialogOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  function handleCreated(piece: PieceDetail) {
    setPieces((prev) => [piece, ...(prev ?? [])]);
  }

  return (
    <>
      {isMobile && (
        <Fab
          color="primary"
          aria-label="New Piece"
          onClick={() => setDialogOpen(true)}
          sx={{
            position: "fixed",
            right: 16,
            bottom: 16,
            zIndex: (muiTheme) => muiTheme.zIndex.speedDial,
          }}
        >
          <AddIcon />
        </Fab>
      )}
      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {error && <Typography color="error">Failed to load pieces.</Typography>}
      {!loading && !error && (
        <PieceList
          pieces={pieces ?? []}
          onNewPiece={() => setDialogOpen(true)}
        />
      )}
      <NewPieceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
