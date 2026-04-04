import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import type { PieceSummary } from "../types"

type PieceListItemProps = {
  piece: PieceSummary
};

const PieceListItem = (props: PieceListItemProps) => {
  const {
    piece
  } = props;
  return <TableRow key={piece.id}>
    <TableCell>
      <img src={piece.thumbnail}/>
    </TableCell>
    <TableCell>
      {piece.name}
    </TableCell>
    <TableCell>
      {piece.current_state.state}
    </TableCell>
    <TableCell>
      {piece.created.toLocaleDateString()}
    </TableCell>
    <TableCell>
      {piece.last_modified.toLocaleDateString()}
    </TableCell>
  </TableRow>
};

type PieceListingProps = {
  pieces: PieceSummary[]
}


const PieceList = (props: PieceListingProps) => {
  const {
    pieces
  } = props;
  return <TableContainer>
    <Table sx={{ minWidth: 650 }} aria-label="simple table">
      <TableHead>
        <TableRow>
          <TableCell>Thumbnail</TableCell>
          <TableCell>Name</TableCell>
          <TableCell>State</TableCell>
          <TableCell>Created</TableCell>
          <TableCell>Last Modified</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {pieces.map((piece) => <PieceListItem piece={piece} />)}
      </TableBody>
    </Table>
  </TableContainer>;
};

export default PieceList;