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
import type { PieceSummary } from '@common/types'
import { SUCCESSORS } from '@common/types'
import CloudinaryImage from './CloudinaryImage'

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
                  style={{ objectFit: 'cover', borderRadius: 4 }}
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
        {piece.current_state.state}
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

  const filteredPieces = useMemo(() => {
    if (activeFilters.length === 0) return pieces
    return pieces.filter((piece) =>
      activeFilters.some((filter) => matchesFilter(piece, filter))
    )
  }, [pieces, activeFilters])

  function handleFilterChange(event: SelectChangeEvent<FilterCategory[]>) {
    setActiveFilters(event.target.value as FilterCategory[])
  }

  return (
    <>
      <Box sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
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
      <TableContainer>
        <Table sx={{ minWidth: 650 }} aria-label="simple table">
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: 'text.secondary' }}>Thumbnail</TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>Name</TableCell>
              <TableCell sx={{ color: 'text.secondary' }}>State</TableCell>
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
