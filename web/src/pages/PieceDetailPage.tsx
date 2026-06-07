import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAppInit, fetchPiece } from "../util/api";
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
  const state = location.state as
    | {
        fromGallery?: boolean;
        returnTo?: { pathname: string; search: string; hash?: string };
      }
    | null
    | undefined;
  const fromGallery = state?.fromGallery === true;
  const returnTo = state?.returnTo ?? null;
  const showBackButton = fromGallery || showBackToPieces;
  const queryClient = useQueryClient();
  const pieceQueryKey = ["piece", id] as const;
  const { data: init, isFetching: initFetching } = useQuery({
    queryKey: ["appInit"],
    queryFn: fetchAppInit,
    staleTime: Infinity, // Read-only subscription; don't trigger a background refetch
  });
  // Allow piece detail when authenticated (no wait needed), or when init has resolved
  // and is not mid-refetch (covers the reactive-refresh re-fetch window after PWA resume).
  // id is always defined — this component is only rendered via the /pieces/:id route
  const { data: piece, isLoading: loading, error } = useQuery<PieceDetail>({
    queryKey: pieceQueryKey,
    queryFn: () => fetchPiece(id!),
    enabled: init !== undefined && (!!init.user || !initFetching),
  });

  return (
    <>
      {showBackButton && (
        <Box sx={{ mb: 2, textAlign: "left" }}>
          <Button
            variant="text"
            onClick={() => {
              if (fromGallery) navigate("/analyze");
              else if (returnTo) {
                navigate(
                  `${returnTo.pathname}${returnTo.search}${returnTo.hash ?? ""}`,
                );
              } else {
                navigate("/");
              }
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
          onPieceUpdated={(updated) => queryClient.setQueryData(pieceQueryKey, updated)}
        />
      )}
    </>
  );
}
