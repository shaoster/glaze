import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FilterListIcon from "@mui/icons-material/FilterList";
import LabelIcon from "@mui/icons-material/Label";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CardHeader,
  Chip,
  Collapse,
  Grid,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
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
import TagChipList from "./TagChipList";
import { DEFAULT_THUMBNAIL } from "./thumbnailConstants";

type FilterCategory = "wip" | "completed" | "discarded";

interface FilterOption {
  value: FilterCategory;
  label: string;
}

interface SelectorPanelProps {
  title: string;
  expanded: boolean;
  count: number;
  emptyLabel: string;
  icon: ReactNode;
  onToggle: () => void;
  summary: ReactNode;
  children: ReactNode;
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

function SelectorPanel({
  title,
  expanded,
  count,
  emptyLabel,
  icon,
  onToggle,
  summary,
  children,
}: SelectorPanelProps) {
  const compactSummary =
    count > 0 ? (
      <Box sx={{ minWidth: 0, flex: 1, overflow: "hidden" }}>{summary}</Box>
    ) : (
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ whiteSpace: "nowrap" }}
      >
        {emptyLabel}
      </Typography>
    );

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        p: expanded ? 1.5 : 1,
        backgroundColor: "background.paper",
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent="space-between"
      >
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{
            minWidth: 0,
            flex: 1,
            overflow: "hidden",
          }}
        >
          {icon}
          {count > 0 && (
            <Chip
              label={count}
              size="small"
              color="primary"
              sx={{ flexShrink: 0 }}
            />
          )}
          {expanded ? (
            <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
              {count > 0 ? (
                <Box sx={{ minWidth: 0 }}>{summary}</Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {emptyLabel}
                </Typography>
              )}
            </Stack>
          ) : (
            compactSummary
          )}
        </Stack>
        <Button
          size="small"
          variant="text"
          sx={{ flexShrink: 0, minWidth: 0, px: 1 }}
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? `Hide ${title.toLowerCase()}`
              : `Show ${title.toLowerCase()}`
          }
        >
          <ExpandMoreIcon
            sx={{
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          />
        </Button>
      </Stack>
      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ pt: 1.5 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}

type PieceListItemProps = {
  piece: PieceSummary;
};

const PieceListItem = (props: PieceListItemProps) => {
  const { piece } = props;
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
            <TagChipList tags={piece.tags ?? []} />
          </CardContent>
        </CardActionArea>
      </Card>
    </Grid>
  );
};

type PieceListingProps = {
  pieces: PieceSummary[];
};

const PieceList = (props: PieceListingProps) => {
  const { pieces } = props;
  const [activeFilters, setActiveFilters] = useState<FilterCategory[]>([]);
  const [activeTags, setActiveTags] = useState<TagEntry[]>([]);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);

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
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" },
          alignItems: "start",
        }}
      >
        <SelectorPanel
          title="Filters"
          expanded={filtersExpanded}
          count={activeFilterOptions.length}
          emptyLabel="No status filters applied."
          icon={<FilterListIcon fontSize="small" color="action" />}
          onToggle={() => setFiltersExpanded((prev) => !prev)}
          summary={
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
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
          }
        >
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
              <TextField {...params} label="Filters" fullWidth />
            )}
          />
        </SelectorPanel>
        <SelectorPanel
          title="Tags"
          expanded={tagsExpanded}
          count={activeTags.length}
          emptyLabel="No tags selected."
          icon={<LabelIcon fontSize="small" color="action" />}
          onToggle={() => setTagsExpanded((prev) => !prev)}
          summary={<TagChipList tags={activeTags} />}
        >
          <TagAutocomplete
            label="Tags"
            options={availableTags}
            value={activeTags}
            onChange={setActiveTags}
            sx={{ minWidth: 0 }}
          />
        </SelectorPanel>
      </Box>
      <Grid container spacing={1} alignItems="stretch" role="rowgroup">
        {filteredPieces.map((piece) => (
          <PieceListItem key={piece.id} piece={piece} />
        ))}
      </Grid>
    </>
  );
};

export default PieceList;
