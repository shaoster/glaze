import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";

import TagChip from "./TagChip";
import type { TagEntry } from "../util/types";

interface TagChipListProps {
  tags: TagEntry[];
  maxVisible?: number;
  alwaysVisibleTagIds?: string[];
}

export default function TagChipList({
  tags,
  maxVisible,
  alwaysVisibleTagIds = [],
}: TagChipListProps) {
  const [expanded, setExpanded] = useState(false);

  const { hiddenCount, visibleTags } = useMemo(() => {
    if (maxVisible === undefined || tags.length <= maxVisible || expanded) {
      return { visibleTags: tags, hiddenCount: 0 };
    }

    const forcedVisibleIds = new Set(alwaysVisibleTagIds);
    const visibleIds = new Set<string>();
    const targetVisibleCount = Math.max(
      maxVisible,
      tags.filter((tag) => forcedVisibleIds.has(tag.id)).length,
    );

    for (const tag of tags) {
      if (forcedVisibleIds.has(tag.id)) {
        visibleIds.add(tag.id);
      }
    }

    for (const tag of tags) {
      if (visibleIds.size >= targetVisibleCount) {
        break;
      }
      visibleIds.add(tag.id);
    }

    const nextVisibleTags = tags.filter((tag) => visibleIds.has(tag.id));
    return {
      visibleTags: nextVisibleTags,
      hiddenCount: Math.max(tags.length - nextVisibleTags.length, 0),
    };
  }, [alwaysVisibleTagIds, expanded, maxVisible, tags]);

  if (tags.length === 0) {
    return null;
  }

  return (
    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
      {visibleTags.map((tag) => (
        <TagChip key={tag.id} label={tag.name} color={tag.color} />
      ))}
      {hiddenCount > 0 && (
        <Button
          size="small"
          variant="text"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(true);
          }}
          sx={{ minWidth: 0, px: 0.5, alignSelf: "center" }}
        >
          +{hiddenCount} more
        </Button>
      )}
      {expanded && maxVisible !== undefined && tags.length > maxVisible && (
        <Button
          size="small"
          variant="text"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(false);
          }}
          sx={{ minWidth: 0, px: 0.5, alignSelf: "center" }}
        >
          Show less
        </Button>
      )}
    </Box>
  );
}
