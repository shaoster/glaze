import { useMemo, useState } from "react";
import {
  Box,
  Checkbox,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import type { PieceSummary, TagEntry } from '@common/types'
import { formatState, getStateDescription, isTerminalState, SUCCESSORS } from '@common/types'
import CloudinaryImage from './CloudinaryImage'
import StateChip from './StateChip'
import TagAutocomplete from './TagAutocomplete'
import TagChipList from './TagChipList'

const DEFAULT_THUMBNAIL = '/thumbnails/question-mark.svg'

type FilterCategory = 'wip' | 'completed' | 'discarded'

const FILTER_OPTIONS: { value: FilterCategory; label: string }[] = [
  { value: 'wip', label: 'Work in Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'discarded', label: 'Discarded' },
]

function matchesFilter(piece: PieceSummary, filter: FilterCategory): boolean {
  const state = piece.current_state.state
  const isNonTerminal = (SUCCESSORS[state] ?? []).length > 0
  if (filter === 'wip') return isNonTerminal
  if (filter === 'completed') return state === 'completed'
  if (filter === 'discarded') return state === 'recycled'
  return false
}

type PieceListItemProps = {
  piece: PieceSummary
};

const PieceListItem = (props: PieceListItemProps) => {
  const { piece } = props;
  const navigate = useNavigate()
  const detailPath = `/pieces/${piece.id}`

  return (
    <TableRow
      hover
      onClick={() => navigate(detailPath)}
      sx={{ cursor: 'pointer' }}
    >
      <TableCell>
        <CloudinaryImage
                  url={piece.thumbnail?.url ?? DEFAULT_THUMBNAIL}
                  cloudinary_public_id={piece.thumbnail?.cloudinary_public_id}
                  alt={piece.name}
                  context="thumbnail"
                  style={{ objectFit: 'cover', borderRadius: 4, marginTop: "10px"}}
                />
      </TableCell>
      <TableCell sx={{ color: 'text.primary' }}>
        <Link
          to={detailPath}
          onClick={(e) => e.stopPropagation()}
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          {piece.name}
        </Link>
      </TableCell>
      <TableCell sx={{ color: 'text.primary' }}>
        <StateChip
          state={piece.current_state.state}
          label={formatState(piece.current_state.state)}
          description={getStateDescription(piece.current_state.state)}
          variant="current"
          isTerminal={isTerminalState(piece.current_state.state)}
        />
      </TableCell>
      <TableCell sx={{ color: 'text.primary' }}>
        <TagChipList tags={piece.tags ?? []} />
      </TableCell>
      <TableCell sx={{ color: 'text.secondary' }}>
        {piece.created.toLocaleDateString()}
      </TableCell>
      <TableCell sx={{ color: 'text.secondary' }}>
        {piece.last_modified.toLocaleDateString()}
      </TableCell>
    </TableRow>
  );
};

type PieceListingProps = {
  pieces: PieceSummary[]
}

const PieceList = (props: PieceListingProps) => {
  const { pieces } = props;
  const [activeFilters, setActiveFilters] = useState<FilterCategory[]>([])
  const [activeTags, setActiveTags] = useState<TagEntry[]>([])
  const filterDesktopColumns = activeFilters.length === 0 ? 2 : 4
  const tagDesktopColumns = activeTags.length === 0 ? 2 : 4

  const availableTags = useMemo(() => {
    const deduped = new Map<string, TagEntry>()
    pieces.forEach((piece) => {
      ;(piece.tags ?? []).forEach((tag) => deduped.set(tag.id, tag))
    })
    return [...deduped.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [pieces])

  const filteredPieces = useMemo(() => {
    return pieces.filter((piece) => {
      const matchesState = activeFilters.length === 0
        ? true
        : activeFilters.some((filter) => matchesFilter(piece, filter))
      const matchesTags = activeTags.length === 0
        ? true
        : activeTags.every((tag) => (piece.tags ?? []).some((pieceTag) => pieceTag.id === tag.id))
      return matchesState && matchesTags
    })
  }, [pieces, activeFilters, activeTags])

  function handleFilterChange(event: SelectChangeEvent<FilterCategory[]>) {
    setActiveFilters(event.target.value as FilterCategory[])
  }

  return (
    <>
      <Box
        sx={{
          mb: 2,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, minmax(0, 1fr))' },
          alignItems: 'start',
        }}
      >
        <Box
          data-testid="piece-list-filter-control"
          data-desktop-columns={filterDesktopColumns}
          sx={{
            gridColumn: { xs: '1 / -1', sm: `span ${filterDesktopColumns}` },
            minWidth: 0,
          }}
        >
          <FormControl
            size="small"
            fullWidth
          >
            <InputLabel id="piece-filter-label">Filter</InputLabel>
            <Select
              labelId="piece-filter-label"
              label="Filter"
              multiple
              value={activeFilters}
              onChange={handleFilterChange}
              renderValue={(selected) =>
                selected
                  .map((v) => FILTER_OPTIONS.find((o) => o.value === v)?.label ?? v)
                  .join(', ')
              }
            >
              {FILTER_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  <Checkbox checked={activeFilters.includes(option.value)} />
                  <ListItemText primary={option.label} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Box
          data-testid="piece-list-tags-control"
          data-desktop-columns={tagDesktopColumns}
          sx={{
            gridColumn: { xs: '1 / -1', sm: `span ${tagDesktopColumns}` },
            minWidth: 0,
          }}
        >
          <TagAutocomplete
            label="Tags"
            options={availableTags}
            value={activeTags}
            onChange={setActiveTags}
            sx={{ minWidth: 0 }}
          />
        </Box>
      </Box>
      <TableContainer>
        <Table sx={{
          minWidth: 650,
          mx: 1,
          '& .MuiTableCell-root': { p: 0 },
        }} aria-label="simple table" size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: 'text.secondary' }}>Thumbnail</TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>Name</TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>State</TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>Tags</TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>Created</TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>Last Modified</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredPieces.map((piece) => <PieceListItem key={piece.id} piece={piece} />)}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};

export default PieceList;
