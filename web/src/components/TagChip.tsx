import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";

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
    <Box
      component="span"
      style={{ backgroundColor: color || undefined }}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.25,
        pl: size === "small" ? 1 : 1.5,
        pr: onDelete ? 0.25 : (size === "small" ? 1 : 1.5),
        py: size === "small" ? 0.25 : 0.5,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "4px",
        verticalAlign: "middle",
        margin: "2px",
      }}
    >
      <Typography
        component="span"
        variant="caption"
        sx={{ color: color ? "common.black" : "text.primary", lineHeight: 1.5 }}
      >
        {label}
      </Typography>
      {onDelete && (
        <IconButton
          component="span"
          size="small"
          onClick={onDelete}
          aria-label={`Remove ${label}`}
          sx={{
            p: 0.25,
            color: color ? "common.black" : "text.secondary",
            opacity: 0.7,
            "&:hover": { opacity: 1 },
          }}
        >
          <CloseIcon sx={{ fontSize: 12 }} />
        </IconButton>
      )}
    </Box>
  );
}
