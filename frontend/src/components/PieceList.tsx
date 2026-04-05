import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import type { PieceSummary } from "../types"

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
        <img src={piece.thumbnail} />
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
  return (
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
          {pieces.map((piece) => <PieceListItem key={piece.id} piece={piece} />)}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default PieceList;
