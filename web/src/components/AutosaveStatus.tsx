import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import PendingIcon from "@mui/icons-material/Pending";
import SyncIcon from "@mui/icons-material/Sync";
import {
  alpha,
  Box,
  CircularProgress,
  Paper,
  Portal,
  Typography,
} from "@mui/material";
import type React from "react";
import type { AutosaveStatus as AutosaveStatusValue } from "./useAutosave";

type AutosaveStatusProps = {
  status: AutosaveStatusValue;
  error?: string | null;
  lastSavedAt?: Date | null;
  variant?: "inline" | "floating";
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
  variant = "inline",
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

  const content = (
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

  if (variant === "floating" && status === "idle") {
    return null;
  }

  if (variant === "floating") {
    return (
      <Portal>
        <Paper
          elevation={8}
          sx={(theme) => ({
            position: "fixed",
            top: "max(16px, calc(env(safe-area-inset-top) + 8px))",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: theme.zIndex.snackbar,
            px: 1.5,
            py: 1,
            borderRadius: 999,
            border: "1px solid",
            borderColor: alpha(theme.palette.common.white, 0.08),
            backgroundColor: alpha(theme.palette.background.paper, 0.94),
            backdropFilter: "blur(16px)",
            boxShadow: `0 18px 42px ${alpha(theme.palette.common.black, 0.34)}`,
            animation:
              status === "saved"
                ? "autosaveFadeOut 220ms ease-out 1s forwards"
                : "autosaveFadeIn 160ms ease-out",
            "@keyframes autosaveFadeIn": {
              from: { opacity: 0, transform: "translate(-50%, -8px)" },
              to: { opacity: 1, transform: "translate(-50%, 0)" },
            },
            "@keyframes autosaveFadeOut": {
              from: { opacity: 1, transform: "translate(-50%, 0)" },
              to: { opacity: 0, transform: "translate(-50%, -6px)" },
            },
          })}
        >
          {content}
        </Paper>
      </Portal>
    );
  }

  return content;
}
