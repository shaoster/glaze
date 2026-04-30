import { useMemo, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import AddIcon from "@mui/icons-material/Add";
import FilterListIcon from "@mui/icons-material/FilterList";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CardHeader,
  Chip,
  ClickAwayListener,
  Grid,
  Paper,
  Popper,
  Stack,
  TextField,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { PieceSummary, TagEntry } from "../util/types";
import {
  formatState,
  getStateDescription,
  isTerminalState,
  SUCCESSORS,
} from "../util/types";
import CloudinaryImage from "./CloudinaryImage";
import StateChip from "./StateChip";
import TagAutocomplete from "./TagAutocomplete";
import TagChip from "./TagChip";
import TagChipList from "./TagChipList";
import { DEFAULT_THUMBNAIL } from "./thumbnailConstants";

type FilterCategory = "wip" | "completed" | "discarded";

interface FilterOption {
  value: FilterCategory;
  label: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { value: "wip", label: "Work in Progress" },
  { value: "completed", label: "Completed" },
  { value: "discarded", label: "Discarded" },
];

function matchesFilter(piece: PieceSummary, filter: FilterCategory): boolean {
  const state = piece.current_state.state;
  const isNonTerminal = (SUCCESSORS[state] ?? []).length > 0;
  if (filter === "wip") return isNonTerminal;
  if (filter === "completed") return state === "completed";
  if (filter === "discarded") return state === "recycled";
  return false;
}

const ADD_BUTTON_BASE_SX = {
  display: "inline-flex",
  alignItems: "center",
  background: "transparent",
  border: "1px dashed",
  borderColor: "divider",
  cursor: "pointer",
  color: "text.secondary",
  fontFamily: "inherit",
  flexShrink: 0,
  "&:hover": { borderColor: "text.secondary" },
} as const;

// Matches MUI Chip size="small" pill shape (height 24px, borderRadius 12px)
const ADD_FILTER_BUTTON_SX = {
  ...ADD_BUTTON_BASE_SX,
  px: "8px",
  height: "24px",
  borderRadius: "12px",
  fontSize: "0.8125rem",
} as const;

// Matches TagChip shape (borderRadius 4px, caption font size)
const ADD_TAG_BUTTON_SX = {
  ...ADD_BUTTON_BASE_SX,
  px: 1,
  py: 0.25,
  borderRadius: "4px",
  fontSize: "0.75rem",
  margin: "2px",
} as const;

type PieceListItemProps = {
  piece: PieceSummary;
  activeTagIds: string[];
};

const PieceListItem = (props: PieceListItemProps) => {
  const { piece, activeTagIds } = props;
  const detailPath = `/pieces/${piece.id}`;

  return (
    <Grid
      size={{ xs: 6, sm: 4, md: 3, lg: 2 }}
      sx={{ display: "flex", flexDirection: "column" }}
      role="row"
    >
      <Card
        sx={{ cursor: "pointer", padding: 0, margin: 0, height: "100%" }}
        data-state={piece.current_state.state}
      >
        <CardActionArea
          sx={{
            transition: "transform 0.15s ease-in-out",
            padding: 1.5,
            height: "100%",
          }}
          href={detailPath}
          role="navigation"
          aria-label={piece.name}
        >
          <CardHeader
            title={<h4 style={{ margin: 0 }}>{piece.name}</h4>}
            avatar={
              <CloudinaryImage
                url={piece.thumbnail?.url ?? DEFAULT_THUMBNAIL}
                cloud_name={piece.thumbnail?.cloud_name}
                cloudinary_public_id={piece.thumbnail?.cloudinary_public_id}
                context="thumbnail"
                style={{ borderRadius: 4, margin: 0 }}
              />
            }
            sx={{ padding: 0, pb: 1 }}
          />
          <CardContent
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              alignItems: "start",
              padding: 0,
              pb: 1,
            }}
          >
            <StateChip
              state={piece.current_state.state}
              label={formatState(piece.current_state.state)}
              description={getStateDescription(piece.current_state.state)}
              variant="current"
              isTerminal={isTerminalState(piece.current_state.state)}
            />
            <TagChipList
              tags={piece.tags ?? []}
              maxVisible={3}
              alwaysVisibleTagIds={activeTagIds}
            />
          </CardContent>
        </CardActionArea>
      </Card>
    </Grid>
  );
};

type PieceListingProps = {
  pieces: PieceSummary[];
  onNewPiece?: () => void;
};

const PieceList = (props: PieceListingProps) => {
  const { pieces, onNewPiece } = props;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [activeFilters, setActiveFilters] = useState<FilterCategory[]>([]);
  const [activeTags, setActiveTags] = useState<TagEntry[]>([]);
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);
  const [tagAnchor, setTagAnchor] = useState<HTMLElement | null>(null);

  const activeFilterOptions = useMemo(
    () =>
      FILTER_OPTIONS.filter((option) => activeFilters.includes(option.value)),
    [activeFilters],
  );

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

  return (
    <>
      <Box
        sx={{
          mb: 2,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 0.75,
        }}
        role="toolbar"
        aria-label="Filters and tags"
      >
        {!isMobile && onNewPiece && (
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={onNewPiece}
            sx={{ flexShrink: 0 }}
          >
            New Piece
          </Button>
        )}
        <FilterListIcon fontSize="small" color="action" sx={{ flexShrink: 0 }} />
        {activeFilterOptions.length > 0 && (
          <Stack
            direction="row"
            spacing={0.75}
            useFlexGap
            flexWrap="wrap"
            alignItems="center"
          >
            {activeFilterOptions.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                size="small"
                onDelete={() =>
                  setActiveFilters((prev) =>
                    prev.filter((value) => value !== option.value),
                  )
                }
              />
            ))}
          </Stack>
        )}

        <Box
          component="button"
          type="button"
          onClick={(e) => {
            setTagAnchor(null);
            setFilterAnchor(filterAnchor ? null : e.currentTarget);
          }}
          aria-label="Add status filter"
          aria-expanded={!!filterAnchor}
          sx={ADD_FILTER_BUTTON_SX}
        >
          + filter
        </Box>

        {activeTags.length > 0 && (
          <Stack
            direction="row"
            spacing={0.75}
            useFlexGap
            flexWrap="wrap"
            alignItems="center"
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
          </Stack>
        )}

        <Box
          component="button"
          type="button"
          onClick={(e) => {
            setFilterAnchor(null);
            setTagAnchor(tagAnchor ? null : e.currentTarget);
          }}
          aria-label="Add tag filter"
          aria-expanded={!!tagAnchor}
          sx={ADD_TAG_BUTTON_SX}
        >
          + tag
        </Box>
      </Box>

      <Popper
        open={!!filterAnchor}
        anchorEl={filterAnchor}
        placement="bottom-start"
        style={{ zIndex: 1300 }}
      >
        <ClickAwayListener onClickAway={() => setFilterAnchor(null)}>
          <Paper elevation={3} sx={{ p: 1.5, mt: 0.5, minWidth: 260 }}>
            <Autocomplete
              multiple
              disableCloseOnSelect
              size="small"
              options={FILTER_OPTIONS}
              value={activeFilterOptions}
              onChange={(_event, nextValue) => {
                setActiveFilters(nextValue.map((option) => option.value));
              }}
              getOptionLabel={(option) => option.label}
              isOptionEqualToValue={(option, selected) =>
                option.value === selected.value
              }
              renderTags={(selected, getTagProps) =>
                selected.map((option, index) => (
                  <Chip
                    {...getTagProps({ index })}
                    key={option.value}
                    label={option.label}
                    size="small"
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Status filters"
                  fullWidth
                  autoFocus
                />
              )}
            />
          </Paper>
        </ClickAwayListener>
      </Popper>

      <Popper
        open={!!tagAnchor}
        anchorEl={tagAnchor}
        placement="bottom-start"
        style={{ zIndex: 1300 }}
      >
        <ClickAwayListener onClickAway={() => setTagAnchor(null)}>
          <Paper elevation={3} sx={{ p: 1.5, mt: 0.5, minWidth: 260 }}>
            <TagAutocomplete
              label="Tags"
              options={availableTags}
              value={activeTags}
              onChange={setActiveTags}
              sx={{ minWidth: 0 }}
            />
          </Paper>
        </ClickAwayListener>
      </Popper>

      <Grid container spacing={1} alignItems="stretch" role="rowgroup">
        {filteredPieces.map((piece) => (
          <PieceListItem
            key={piece.id}
            piece={piece}
            activeTagIds={activeTags.map((tag) => tag.id)}
          />
        ))}
      </Grid>
    </>
  );
};

export default PieceList;
