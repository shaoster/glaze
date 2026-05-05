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
  // `pieces` is the committed list shown in the masonry grid.
  // `pendingPieces` holds newly fetched items that are buffered while
  // loadingMore is true, then flushed in one DOM update when loading finishes
  // to avoid mid-scroll masonry reflow.
  const [pieces, setPieces] = useState<PieceSummary[]>([]);
  const pendingRef = useRef<PieceSummary[] | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<PieceSortOrder>(DEFAULT_PIECE_SORT);
  const [dialogOpen, setDialogOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const offsetRef = useRef(0);
  const piecesRef = useRef<PieceSummary[]>([]);
  const sortOrderRef = useRef(sortOrder);
  // Synchronous guard — React state updates are batched and arrive too late
  // to prevent double-firing from rapid scroll events.
  const loadingMoreRef = useRef(false);

  const loadPage = useCallback(
    async (ordering: PieceSortOrder, offset: number, replace: boolean) => {
      if (replace) {
        if (piecesRef.current.length === 0) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }
      } else {
        setLoadingMore(true);
        loadingMoreRef.current = true;
      }
      setError(null);
      try {
        const page = await fetchPieces({
          ordering,
          limit: PIECES_PAGE_SIZE,
          offset,
        });
        if (sortOrderRef.current !== ordering) return;
        setCount(page.count);
        if (replace) {
          pendingRef.current = null;
          setPieces(page.results);
        } else {
          // Buffer the new items; flush them when we clear loadingMore so
          // the masonry grid updates in one frame instead of reshuffling
          // mid-scroll as items trickle in.
          pendingRef.current = page.results;
        }
        offsetRef.current = offset + page.results.length;
      } catch {
        setError("Failed to load pieces.");
      } finally {
        if (replace) {
          setLoading(false);
          setRefreshing(false);
        } else {
          // Flush buffered items and clear the loading flag atomically
          const pending = pendingRef.current;
          pendingRef.current = null;
          if (pending) setPieces((prev) => [...prev, ...pending]);
          setLoadingMore(false);
          loadingMoreRef.current = false;
        }
      }
    },
    [],
  );

  // Keep the latest rendered list available so replace fetches can
  // distinguish first-load empty state from re-sorting an existing list.
  useEffect(() => {
    piecesRef.current = pieces;
  }, [pieces]);

  useEffect(() => {
    sortOrderRef.current = sortOrder;
    offsetRef.current = 0;
    loadingMoreRef.current = false;
    pendingRef.current = null;
    loadPage(sortOrder, 0, true);
  }, [sortOrder, loadPage]);

  function handleSortChange(order: PieceSortOrder) {
    setSortOrder(order);
  }

  const handleLoadMore = useCallback(() => {
    if (loadingMoreRef.current || loading || refreshing) return;
    const currentOffset = offsetRef.current;
    loadPage(sortOrder, currentOffset, false);
  }, [loading, refreshing, sortOrder, loadPage]);

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
            // Sit above the bottom tab bar (56px) with extra breathing room
            bottom: "calc(56px + 18px)",
            zIndex: (muiTheme) => muiTheme.zIndex.speedDial,
            boxShadow: (muiTheme) => `
              0 1px 0 rgba(255,255,255,0.18) inset,
              0 -2px 6px rgba(0,0,0,0.35) inset,
              0 8px 14px ${muiTheme.palette.common.black}8c,
              0 22px 40px ${muiTheme.palette.primary.dark}8c,
              0 0 0 1px ${muiTheme.palette.primary.dark}b3
            `,
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
          loading={refreshing}
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
