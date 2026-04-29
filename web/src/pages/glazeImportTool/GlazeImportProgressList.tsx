import { Box, LinearProgress, List, Stack, Typography } from "@mui/material";
import type { UploadProgressEntry } from "./glazeImportToolTypes";

interface GlazeImportProgressListProps {
  title: string;
  entries: UploadProgressEntry[];
  statusLabels: Record<UploadProgressEntry["status"], string>;
}

export default function GlazeImportProgressList({
  title,
  entries,
  statusLabels,
}: GlazeImportProgressListProps) {
  if (entries.length === 0) return null;

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle1">{title}</Typography>
      <List
        sx={{
          border: (theme) => `1px solid ${theme.palette.divider}`,
          borderRadius: 3,
        }}
      >
        {entries.map((entry) => (
          <Box key={entry.id} sx={{ px: 2, py: 1.5 }}>
            <Stack spacing={0.75}>
              <Stack direction="row" justifyContent="space-between" spacing={2}>
                <Typography variant="body2">{entry.filename}</Typography>
                <Typography
                  variant="body2"
                  color={entry.status === "error" ? "error" : "text.secondary"}
                >
                  {statusLabels[entry.status]}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={entry.progress}
                color={
                  entry.status === "error"
                    ? "error"
                    : entry.status === "ready"
                      ? "success"
                      : "primary"
                }
              />
              {entry.error ? (
                <Typography variant="body2" color="error">
                  {entry.error}
                </Typography>
              ) : null}
            </Stack>
          </Box>
        ))}
      </List>
    </Stack>
  );
}
