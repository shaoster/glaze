import { useCallback, useEffect, useRef, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import {
  Box,
  CircularProgress,
  Fab,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  DEFAULT_PIECE_SORT,
  PIECES_PAGE_SIZE,
  fetchPieces,
} from "../util/api";
import type { PieceSortOrder } from "../util/api";
import NewPieceDialog from "../components/NewPieceDialog";
import PieceList from "../components/PieceList";
import type { PieceDetail, PieceSummary } from "../util/types";

export default function PieceListPage() {
  const [pieces, setPieces] = useState<PieceSummary[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<PieceSortOrder>(DEFAULT_PIECE_SORT);
  const [dialogOpen, setDialogOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const offsetRef = useRef(0);
  const sortOrderRef = useRef(sortOrder);

  const loadPage = useCallback(
    async (ordering: PieceSortOrder, offset: number, replace: boolean) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const page = await fetchPieces({
          ordering,
          limit: PIECES_PAGE_SIZE,
          offset,
        });
        if (sortOrderRef.current !== ordering) return;
        setCount(page.count);
        setPieces((prev) => (replace ? page.results : [...prev, ...page.results]));
        offsetRef.current = offset + page.results.length;
      } catch {
        setError("Failed to load pieces.");
      } finally {
        if (replace) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    sortOrderRef.current = sortOrder;
    offsetRef.current = 0;
    setPieces([]);
    loadPage(sortOrder, 0, true);
  }, [sortOrder, loadPage]);

  function handleSortChange(order: PieceSortOrder) {
    setSortOrder(order);
  }

  const handleLoadMore = useCallback(() => {
    if (loadingMore || loading) return;
    const currentOffset = offsetRef.current;
    loadPage(sortOrder, currentOffset, false);
  }, [loadingMore, loading, sortOrder, loadPage]);

  function handleCreated(piece: PieceDetail) {
    setPieces((prev) => [piece, ...prev]);
    setCount((c) => c + 1);
  }

  const hasMore = pieces.length < count;

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
      {error && <Typography color="error">{error}</Typography>}
      {!loading && !error && (
        <PieceList
          pieces={pieces}
          onNewPiece={() => setDialogOpen(true)}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          onLoadMore={handleLoadMore}
          hasMore={hasMore}
          loadingMore={loadingMore}
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
