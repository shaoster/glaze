import Chip from "@mui/material/Chip";

export interface TagChipProps {
  label: string;
  color?: string;
  size?: "small" | "medium";
  onDelete?: () => void;
}

export default function TagChip({
  label,
  color = "",
  size = "small",
  onDelete,
}: TagChipProps) {
  return (
    <Chip
      label={label}
      size={size}
      onDelete={onDelete}
      sx={{ backgroundColor: color || undefined, color: "common.black" }}
    />
  );
}
