import { useCallback, useMemo } from "react";
import { useLocation, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import AddIcon from "@mui/icons-material/Add";
import {
  Box,
  CircularProgress,
  Fab,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_PIECE_SORT,
  PIECE_SORT_OPTIONS,
  PIECES_PAGE_SIZE,
  fetchPieces,
} from "../util/api";
import type { PieceSortOrder } from "../util/api";
import NewPieceDialog from "../components/NewPieceDialog";
import PieceList from "../components/PieceList";


export default function PieceListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sortFromUrl = searchParams.get("sort") as PieceSortOrder | null;
  const sortOrder: PieceSortOrder =
    sortFromUrl && PIECE_SORT_OPTIONS.some((o) => o.value === sortFromUrl)
      ? sortFromUrl
      : DEFAULT_PIECE_SORT;

  const navigate = useNavigate();
  const location = useLocation();
  const match = useMatch("/new");
  const dialogOpen = match !== null;

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const queryClient = useQueryClient();

  const {
    data,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    isError,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["pieces", sortOrder],
    queryFn: ({ pageParam }: { pageParam: number }) =>
      fetchPieces({ ordering: sortOrder, limit: PIECES_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((n, p) => n + p.results.length, 0);
      return fetched < lastPage.count ? fetched : undefined;
    },
    // Show previous sort's data while the new sort loads to avoid a flash of
    // the spinner every time the user changes sort order.
    placeholderData: keepPreviousData,
  });

  // useInfiniteQuery adds pages atomically on resolution (no mid-scroll trickle),
  // so data.pages can be flattened directly without a manual double-buffer.
  const pieces = useMemo(
    () => data?.pages.flatMap((p) => p.results) ?? [],
    [data?.pages],
  );
  const count = data?.pages[0]?.count ?? 0;

  const handleOpenDialog = useCallback(() => {
    navigate(
      { pathname: "/new", search: searchParams.toString() },
      { state: { fromApp: true } }
    );
  }, [navigate, searchParams]);

  const handleCloseDialog = useCallback(() => {
    if (location.state?.fromApp) {
      navigate(-1);
    } else {
      navigate(
        { pathname: "/", search: searchParams.toString() },
        { replace: true }
      );
    }
  }, [navigate, location.state, searchParams]);

  function handleSortChange(order: PieceSortOrder) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (order === DEFAULT_PIECE_SORT) {
          next.delete("sort");
        } else {
          next.set("sort", order);
        }
        return next;
      },
      { replace: false },
    );
  }

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  function handleCreated() {
    void queryClient.invalidateQueries({ queryKey: ["pieces", sortOrder] });
  }

  const refreshing = isFetching && !isFetchingNextPage && !isLoading;

  return (
    <>
      {isMobile && (
        <Fab
          color="primary"
          aria-label="New Piece"
          onClick={handleOpenDialog}
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
      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {isError && <Typography color="error">Failed to load pieces.</Typography>}
      {!isLoading && !isError && (
        <PieceList
          pieces={pieces}
          onNewPiece={handleOpenDialog}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          onLoadMore={handleLoadMore}
          hasMore={hasNextPage ?? pieces.length < count}
          loading={refreshing}
          loadingMore={isFetchingNextPage}
        />
      )}
      <NewPieceDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onCreated={handleCreated}
      />
    </>
  );
}
