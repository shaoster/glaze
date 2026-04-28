import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import PendingIcon from "@mui/icons-material/Pending";
import SyncIcon from "@mui/icons-material/Sync";
import { Box, CircularProgress, Typography } from "@mui/material";
import type React from "react";
import type { AutosaveStatus as AutosaveStatusValue } from "./useAutosave";

type AutosaveStatusProps = {
  status: AutosaveStatusValue;
  error?: string | null;
  lastSavedAt?: Date | null;
};

function formatSavedTime(date: Date | null | undefined): string {
  if (!date) return "Saved";
  return `Saved ${date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export default function AutosaveStatus({
  status,
  error,
  lastSavedAt,
}: AutosaveStatusProps) {
  const statusConfig = {
    idle: {
      label: "All changes saved",
      color: "text.secondary",
      icon: <CheckCircleIcon fontSize="small" />,
    },
    pending: {
      label: "Saving soon",
      color: "warning.main",
      icon: <PendingIcon fontSize="small" />,
    },
    saving: {
      label: "Saving",
      color: "primary.main",
      icon: <CircularProgress size={16} color="inherit" />,
    },
    saved: {
      label: formatSavedTime(lastSavedAt),
      color: "success.main",
      icon: <CheckCircleIcon fontSize="small" />,
    },
    error: {
      label: error ?? "Autosave failed",
      color: "error.main",
      icon: <ErrorOutlineIcon fontSize="small" />,
    },
  } satisfies Record<
    AutosaveStatusValue,
    { label: string; color: string; icon: React.ReactNode }
  >;
  const config = statusConfig[status];

  return (
    <Box
      data-testid="autosave-status"
      role="status"
      aria-live="polite"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        minHeight: 32,
        color: config.color,
      }}
    >
      {status === "pending" ? <SyncIcon fontSize="small" /> : config.icon}
      <Typography variant="body2">{config.label}</Typography>
    </Box>
  );
}
