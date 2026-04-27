import Box from "@mui/material/Box";

import TagChip from "./TagChip";
import type { TagEntry } from "../util/types";

interface TagChipListProps {
  tags: TagEntry[];
}

export default function TagChipList({ tags }: TagChipListProps) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
      {tags.map((tag) => (
        <TagChip key={tag.id} label={tag.name} color={tag.color} />
      ))}
    </Box>
  );
}
