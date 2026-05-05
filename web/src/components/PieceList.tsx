import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import FilterListIcon from "@mui/icons-material/FilterList";
import SortIcon from "@mui/icons-material/Sort";
import {
  Box,
  Chip,
  CircularProgress,
  MenuItem,
  Select,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { PieceSummary, TagEntry } from "../util/types";
import { formatState, isTerminalState, SUCCESSORS } from "../util/types";
import type { PieceSortOrder } from "../util/api";
import { DEFAULT_PIECE_SORT, PIECE_SORT_OPTIONS } from "../util/api";
import { Masonry } from "masonic";
import type { RenderComponentProps } from "masonic";
import { Link } from "react-router-dom";
import CloudinaryImage from "./CloudinaryImage";
import TagAutocomplete from "./TagAutocomplete";
import TagChip from "./TagChip";
import { DEFAULT_THUMBNAIL } from "./thumbnailConstants";

// Kiln-glow amber used for stale indicator
const KILN_COLOR = "oklch(0.72 0.13 55)";

type FilterCategory = "wip" | "completed" | "discarded";

interface FilterOption {
  value: FilterCategory;
  label: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { value: "wip", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "discarded", label: "Recycled" },
];

function matchesFilter(piece: PieceSummary, filter: FilterCategory): boolean {
  const state = piece.current_state.state;
  const isNonTerminal = (SUCCESSORS[state] ?? []).length > 0;
  if (filter === "wip") return isNonTerminal;
  if (filter === "completed") return state === "completed";
  if (filter === "discarded") return state === "recycled";
  return false;
}

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

// Variable card thumbnail height based on recency
function thumbHeight(days: number, isTerminal: boolean): number {
  if (isTerminal) return 110;
  if (days <= 2) return 180;
  if (days < 14) return 140;
  return 110;
}

interface PieceCardProps {
  piece: PieceSummary;
}

const PieceCard = ({ piece }: PieceCardProps) => {
  const theme = useTheme();
  const isTerminal = isTerminalState(piece.current_state.state);
  const days = daysSince(new Date(piece.last_modified));
  const isStale = days >= 14 && !isTerminal;
  const h = thumbHeight(days, isTerminal);
  const label = formatState(piece.current_state.state);
  const detailPath = `/pieces/${piece.id}`;

  // Tags: show 2 visible + dashed overflow chip (non-expandable in card)
  const tags = piece.tags ?? [];
  const visibleTags = tags.slice(0, 2);
  const extra = tags.length - visibleTags.length;

  const lastActivity = days === 0 ? "today" : `${days}d ago`;

  const accentColor = theme.palette.primary.main;
  const accentText = theme.palette.primary.contrastText;

  return (
    <Box
      component={Link}
      to={detailPath}
      sx={{
        display: "block",
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        textDecoration: "none",
        color: "inherit",
        opacity: isTerminal ? 0.78 : 1,
        transition: "opacity 0.15s, filter 0.15s",
        "&:hover": {
          opacity: isTerminal ? 0.9 : 1,
          filter: "brightness(1.07)",
        },
      }}
    >
      {/* Thumbnail area */}
      <Box sx={{ height: h, position: "relative", overflow: "hidden" }}>
        <CloudinaryImage
          url={piece.thumbnail?.url ?? DEFAULT_THUMBNAIL}
          cloud_name={piece.thumbnail?.cloud_name}
          cloudinary_public_id={piece.thumbnail?.cloudinary_public_id}
          context="gallery"
          requestedWidth={300}
          requestedHeight={200}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />

        {/* Bottom gradient scrim */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.55) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Top-right: stale dot */}
        {isStale && (
          <Box
            sx={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: KILN_COLOR,
              boxShadow: `0 0 6px ${KILN_COLOR}`,
            }}
          />
        )}

        {/* Bottom-left: state chip overlay */}
        <Box
          sx={{
            position: "absolute",
            bottom: 6,
            left: 6,
            px: "8px",
            py: "3px",
            borderRadius: 999,
            bgcolor: isTerminal ? alpha("#000", 0.55) : accentColor,
            color: isTerminal ? "text.secondary" : accentText,
            backdropFilter: isTerminal ? "blur(6px)" : "none",
            border: isTerminal ? "1px solid rgba(255,255,255,0.12)" : "none",
            fontSize: "0.6875rem",
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
            letterSpacing: "0.02em",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            lineHeight: 1,
          }}
        >
          <Box
            sx={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              flexShrink: 0,
              bgcolor: isTerminal ? accentColor : alpha(accentText, 0.7),
            }}
          />
          {label}
        </Box>
      </Box>

      {/* Card body */}
      <Box sx={{ px: 1.25, pt: 1, pb: 1.25 }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            lineHeight: 1.25,
            letterSpacing: "-0.005em",
            color: "text.primary",
          }}
        >
          {piece.name}
        </Typography>

        {/* Last-activity caption */}
        <Box
          sx={{
            mt: 0.5,
            fontSize: "0.6875rem",
            color: "text.disabled",
            fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            flexWrap: "wrap",
          }}
        >
          <span>{lastActivity}</span>
          {!isTerminal && (
            <>
              <span>·</span>
              <span style={{ color: isStale ? KILN_COLOR : undefined }}>
                {days}d in {label.toLowerCase()}
              </span>
            </>
          )}
        </Box>

        {/* Tags */}
        {tags.length > 0 && (
          <Box sx={{ mt: 0.75, display: "flex", flexWrap: "wrap" }}>
            {visibleTags.map((tag) => (
              <TagChip key={tag.id} label={tag.name} color={tag.color} />
            ))}
            {extra > 0 && (
              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  px: "7px",
                  py: "3px",
                  border: "1px dashed",
                  borderColor: "divider",
                  borderRadius: "4px",
                  fontSize: "0.6875rem",
                  fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
                  color: "text.disabled",
                  margin: "2px",
                }}
              >
                +{extra}
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

function MasonryPieceCard({ data }: RenderComponentProps<PieceSummary>) {
  return <PieceCard piece={data} />;
}

type PieceListProps = {
  pieces: PieceSummary[];
  onNewPiece?: () => void;
  sortOrder?: PieceSortOrder;
  onSortChange?: (order: PieceSortOrder) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  loadingMore?: boolean;
};

const PieceList = (props: PieceListProps) => {
  const {
    pieces,
    onNewPiece,
    sortOrder = DEFAULT_PIECE_SORT,
    onSortChange,
    onLoadMore,
    hasMore = false,
    loading = false,
    loadingMore = false,
  } = props;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [activeFilters, setActiveFilters] = useState<FilterCategory[]>([]);
  const [activeTags, setActiveTags] = useState<TagEntry[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return;
    function check() {
      const sentinel = sentinelRef.current;
      if (!sentinel) return;
      const rect = sentinel.getBoundingClientRect();
      if (rect.top <= window.innerHeight + 300) onLoadMoreRef.current?.();
    }
    window.addEventListener("scroll", check, { passive: true });
    check();
    return () => window.removeEventListener("scroll", check);
  }, [hasMore]);

  const availableTags = useMemo(() => {
    const deduped = new Map<string, TagEntry>();
    pieces.forEach((piece) => {
      (piece.tags ?? []).forEach((tag) => deduped.set(tag.id, tag));
    });
    return [...deduped.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [pieces]);

  const filteredPieces = useMemo(() => {
    return pieces.filter((piece) => {
      const matchesState =
        activeFilters.length === 0
          ? true
          : activeFilters.some((filter) => matchesFilter(piece, filter));
      const matchesTags =
        activeTags.length === 0
          ? true
          : activeTags.every((tag) =>
              (piece.tags ?? []).some((pieceTag) => pieceTag.id === tag.id),
            );
      return matchesState && matchesTags;
    });
  }, [pieces, activeFilters, activeTags]);

  const activeFilterLabel = useMemo(() => {
    if (activeFilters.length === 0 && activeTags.length === 0) return "All";
    const parts: string[] = [];
    activeFilters.forEach((f) => {
      const opt = FILTER_OPTIONS.find((o) => o.value === f);
      if (opt) parts.push(opt.label);
    });
    activeTags.forEach((t) => parts.push(t.name));
    return parts.join(", ");
  }, [activeFilters, activeTags]);

  const hasActiveFilters = activeFilters.length > 0 || activeTags.length > 0;
  const filterKey = useMemo(() => {
    const filters = [...activeFilters].sort().join(",");
    const tags = activeTags
      .map((tag) => tag.id)
      .sort()
      .join(",");
    return `${filters}|${tags}|${sortOrder}`;
  }, [activeFilters, activeTags, sortOrder]);

  const toggleFilter = useCallback((filter: FilterCategory) => {
    setActiveFilters((prev) =>
      prev.includes(filter)
        ? prev.filter((f) => f !== filter)
        : [...prev, filter],
    );
  }, []);

  const sortLabel = useMemo(() => {
    return (
      PIECE_SORT_OPTIONS.find((o) => o.value === sortOrder)?.label ?? sortOrder
    );
  }, [sortOrder]);

  const showOverlay = loading || loadingMore;
  const isReplacing = loading;

  return (
    <>
      {/* Condensed filter strip — sticky, collapses to the toggle button height only.
          The expanded panel is absolutely positioned so it overlays the masonry
          without pushing content down or causing the page to scroll. */}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "transparent",
          pt: 0.75,
          pb: 0.75,
          mb: 0,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          component="button"
          type="button"
          onClick={() => setFilterOpen((o) => !o)}
          aria-expanded={filterOpen}
          aria-label="Toggle filters"
          sx={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            px: 1.5,
            py: 1,
            borderRadius: 2,
            bgcolor: alpha("#181210", 0.95),
            border: "1px solid",
            borderColor: "divider",
            color: "text.secondary",
            fontFamily: "inherit",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              overflow: "hidden",
            }}
          >
            <FilterListIcon
              sx={{ fontSize: 15, flexShrink: 0, color: "text.disabled" }}
            />
            <Typography
              component="span"
              sx={{
                fontSize: "0.8125rem",
                fontWeight: hasActiveFilters ? 600 : 400,
                color: hasActiveFilters ? "text.primary" : "text.secondary",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {activeFilterLabel}
            </Typography>
            <Typography
              component="span"
              sx={{
                fontSize: "0.6875rem",
                color: "text.disabled",
                fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
                flexShrink: 0,
              }}
            >
              · {filteredPieces.length}
              {hasMore ? "+" : ""} pieces
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              flexShrink: 0,
            }}
          >
            <SortIcon sx={{ fontSize: 13, color: "text.disabled" }} />
            <Typography
              component="span"
              sx={{
                fontSize: "0.6875rem",
                color: "text.disabled",
                fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
              }}
            >
              {sortLabel}
            </Typography>
          </Box>
        </Box>

        {/* Absolutely positioned so the panel overlays the masonry without
            pushing it down or triggering a page scroll. */}
        {filterOpen && (
          <Box
            sx={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              mt: 0,
              p: 1.5,
              borderRadius: "0 0 8px 8px",
              bgcolor: alpha("#181210", 0.97),
              border: "1px solid",
              borderColor: "divider",
              borderTop: "none",
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              zIndex: 11,
            }}
          >
            {/* Status filter chips */}
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
              {FILTER_OPTIONS.map((opt) => {
                const active = activeFilters.includes(opt.value);
                return (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    size="small"
                    onClick={() => toggleFilter(opt.value)}
                    sx={{
                      cursor: "pointer",
                      bgcolor: active ? "primary.main" : alpha("#000", 0.18),
                      color: active ? "primary.contrastText" : "text.secondary",
                      border: "1px solid",
                      borderColor: active ? "primary.main" : "divider",
                      fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
                      fontSize: "0.6875rem",
                      "&:hover": { filter: "brightness(1.12)" },
                    }}
                  />
                );
              })}
            </Box>

            {/* Tag filter: chips for active tags + "+ tag" button to open picker */}
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 0.75,
                alignItems: "center",
              }}
            >
              {activeTags.map((tag) => (
                <TagChip
                  key={tag.id}
                  label={tag.name}
                  color={tag.color}
                  onDelete={() =>
                    setActiveTags((prev) => prev.filter((t) => t.id !== tag.id))
                  }
                />
              ))}
              {tagPickerOpen ? (
                <Box
                  sx={{ width: "100%", mt: activeTags.length > 0 ? 0.5 : 0 }}
                >
                  <TagAutocomplete
                    label="Filter by tag"
                    options={availableTags}
                    value={activeTags}
                    onChange={(next) => {
                      setActiveTags(next);
                      setTagPickerOpen(false);
                    }}
                    sx={{ minWidth: 0 }}
                  />
                </Box>
              ) : (
                <Box
                  component="button"
                  type="button"
                  onClick={() => setTagPickerOpen(true)}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    px: "8px",
                    height: 24,
                    borderRadius: "12px",
                    bgcolor: "transparent",
                    border: "1px dashed",
                    borderColor: "divider",
                    color: "text.disabled",
                    fontSize: "0.75rem",
                    fontFamily: "inherit",
                    cursor: "pointer",
                    "&:hover": {
                      borderColor: "text.secondary",
                      color: "text.secondary",
                    },
                  }}
                >
                  + tag
                </Box>
              )}
            </Box>

            {/* Sort */}
            {onSortChange && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <SortIcon fontSize="small" sx={{ color: "text.disabled" }} />
                <Select
                  value={sortOrder}
                  onChange={(e) =>
                    onSortChange(e.target.value as PieceSortOrder)
                  }
                  size="small"
                  variant="standard"
                  disableUnderline
                  inputProps={{ "aria-label": "Sort order" }}
                  sx={{
                    fontSize: "0.8125rem",
                    color: "text.secondary",
                    "& .MuiSelect-select": { py: 0 },
                  }}
                >
                  {PIECE_SORT_OPTIONS.map((opt) => (
                    <MenuItem
                      key={opt.value}
                      value={opt.value}
                      sx={{ fontSize: "0.8125rem" }}
                    >
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            )}

            {/* New Piece button (desktop only) */}
            {!isMobile && onNewPiece && (
              <Box
                component="button"
                type="button"
                onClick={onNewPiece}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 1.5,
                  py: 0.75,
                  alignSelf: "flex-start",
                  borderRadius: 1.5,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  border: "none",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  "&:hover": { filter: "brightness(1.1)" },
                }}
              >
                <AddIcon sx={{ fontSize: 16 }} />
                New Piece
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Masonry layout keeps append order stable without CSS column rebalancing. */}
      <Box sx={{ mt: 1.5 }} />
      {/* Wrapper enables the loadingMore overlay without affecting layout */}
      <Box sx={{ position: "relative" }}>
        <Box
          data-testid="piece-list-content"
          style={{
            opacity: isReplacing ? 0.42 : 1,
            transition: "opacity 0.18s ease",
          }}
          sx={{
            pointerEvents: showOverlay ? "none" : "auto",
          }}
        >
          <Masonry
            key={filterKey}
            items={filteredPieces}
            render={MasonryPieceCard}
            itemKey={(piece) => piece.id}
            itemHeightEstimate={260}
            columnWidth={isMobile ? 160 : 220}
            maxColumnCount={isMobile ? 2 : 4}
            columnGutter={8}
            rowGutter={8}
          />
        </Box>

        {/* Centered spinner overlay while fetching the next page */}
        {showOverlay && (
          <Box
            data-testid="piece-list-overlay"
            style={{
              backgroundColor: isReplacing
                ? alpha(theme.palette.background.default, 0.5)
                : "transparent",
            }}
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 80,
            }}
          >
            <CircularProgress size={32} />
          </Box>
        )}
      </Box>

      {/* Scroll sentinel — placed after the grid so it triggers near the bottom */}
      <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />

      {!hasMore && !showOverlay && pieces.length > 0 && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
          <Typography variant="caption" color="text.disabled">
            End of pieces
          </Typography>
        </Box>
      )}
    </>
  );
};

export default PieceList;
