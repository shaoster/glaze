import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { fetchPiece } from "../util/api";
import { useAsync } from "../util/useAsync";
import PieceDetailComponent from "../components/PieceDetail";
import { type PieceDetail } from "../util/types";

interface PieceDetailPageProps {
  showBackToPieces?: boolean;
}

export default function PieceDetailPage({
  showBackToPieces = true,
}: PieceDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const fromGallery =
    (location.state as { fromGallery?: boolean } | null)?.fromGallery === true;
  // location.key is 'default' only when the user landed directly on this URL
  // without navigating from elsewhere in the app.
  const hasAppHistory = location.key !== "default";
  const showBackButton = fromGallery || showBackToPieces;
  // id is always defined — this component is only rendered via the /pieces/:id route
  const {
    data: piece,
    loading,
    error,
    setData: setPiece,
  } = useAsync<PieceDetail>(() => fetchPiece(id!), [id]);

  return (
    <>
      {showBackButton && (
        <Box sx={{ mb: 2, textAlign: "left" }}>
          <Button
            variant="text"
            onClick={() => {
          if (fromGallery) navigate("/analyze");
          else if (hasAppHistory) navigate(-1);
          else navigate("/");
        }}
            sx={{ px: 0 }}
          >
            {fromGallery ? "← Back to Gallery" : "← Back to Pieces"}
          </Button>
        </Box>
      )}
      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {error && <Typography color="error">Failed to load piece.</Typography>}
      {piece && (
        <PieceDetailComponent
          piece={piece}
          onPieceUpdated={(updated) => setPiece(updated)}
        />
      )}
    </>
  );
}
