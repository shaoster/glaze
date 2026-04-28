import { useState } from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import GlobalEntryDialog from "./GlobalEntryDialog";

export interface GlobalEntryFieldProps {
  globalName: string;
  label: string;
  value: string;
  onSelect: (entry: { id: string; name: string } | null) => void;
  helperText?: string;
  required?: boolean;
  canCreate?: boolean;
  sx?: SxProps<Theme>;
}

// Keep global refs visually consistent across forms: a selected value becomes
// a removable chip, and every edit path funnels through the shared dialog.
export default function GlobalEntryField({
  globalName,
  label,
  value,
  onSelect,
  helperText,
  required = false,
  canCreate = false,
  sx,
}: GlobalEntryFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <Box sx={sx}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 0.5 }}
      >
        {label}
        {required && " *"}
      </Typography>
      <Box
        sx={{
          display: "flex",
          gap: 1,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {value && <Chip label={value} onDelete={() => onSelect(null)} />}
        <Button
          variant="outlined"
          size="small"
          onClick={() => setOpen(true)}
          aria-label={value ? `Change ${label}` : `Browse ${label}`}
          sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
        >
          {value ? "Change…" : "Browse…"}
        </Button>
      </Box>
      {helperText && (
        <Typography variant="caption" color="text.secondary">
          {helperText}
        </Typography>
      )}
      <GlobalEntryDialog
        globalName={globalName}
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onSelect}
        canCreate={canCreate}
      />
    </Box>
  );
}
