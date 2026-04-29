import { Alert, Button, Chip, List, ListItemButton, ListItemText, Stack, Typography } from "@mui/material";
import type { ManualSquareCropImportResponse } from "../../util/api";
import GlazeImportProgressList from "./GlazeImportProgressList";
import type { UploadProgressEntry } from "./glazeImportToolTypes";

interface GlazeImportImportStageProps {
  allReviewed: boolean;
  importRunning: boolean;
  importError: string | null;
  importBuildProgress: UploadProgressEntry[];
  importResult: ManualSquareCropImportResponse | null;
  hasDuplicates: boolean;
  onRunImport: () => void;
  onGoToReconcile: () => void;
}

const IMPORT_STATUS_LABELS: Record<UploadProgressEntry["status"], string> = {
  queued: "Queued",
  processing: "Building crop…",
  uploading: "Uploading…",
  ready: "Done",
  error: "Error",
};

export default function GlazeImportImportStage({
  allReviewed,
  importRunning,
  importError,
  importBuildProgress,
  importResult,
  hasDuplicates,
  onRunImport,
  onGoToReconcile,
}: GlazeImportImportStageProps) {
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Import creates new public glaze types and glaze combinations and skips
        duplicates that already exist in the public library.
      </Alert>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ sm: "center" }}
      >
        <Button
          variant="contained"
          onClick={onRunImport}
          disabled={!allReviewed || importRunning}
        >
          {importRunning ? "Importing…" : "Run Bulk Import"}
        </Button>
        {!allReviewed ? (
          <Typography color="text.secondary">
            Review every record before importing.
          </Typography>
        ) : null}
      </Stack>
      {importError ? <Alert severity="error">{importError}</Alert> : null}
      <GlazeImportProgressList
        title="Build Progress"
        entries={importBuildProgress}
        statusLabels={IMPORT_STATUS_LABELS}
      />
      {importResult ? (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
            <Chip
              color="success"
              label={`${importResult.summary.created_glaze_types} glaze types created`}
            />
            <Chip
              color="success"
              label={`${importResult.summary.created_glaze_combinations} combinations created`}
            />
            <Chip
              label={`${importResult.summary.skipped_duplicates} duplicates skipped`}
              color={hasDuplicates ? "warning" : "default"}
            />
            <Chip
              color={importResult.summary.errors ? "error" : "default"}
              label={`${importResult.summary.errors} errors`}
            />
            {hasDuplicates ? (
              <Button variant="outlined" size="small" onClick={onGoToReconcile}>
                Reconcile Duplicates →
              </Button>
            ) : null}
          </Stack>
          <List
            sx={{
              border: (theme) => `1px solid ${theme.palette.divider}`,
              borderRadius: 3,
            }}
          >
            {importResult.results.map((result) => {
              const adminPath = result.object_id
                ? `/admin/api/${result.kind.replace("_", "")}/${result.object_id}/change/`
                : null;
              return (
                <ListItemButton
                  key={result.client_id}
                  {...(adminPath
                    ? {
                        component: "a",
                        href: adminPath,
                        target: "_blank",
                        rel: "noopener noreferrer",
                      }
                    : { disabled: true })}
                >
                  <ListItemText
                    primary={`${result.name || result.filename} — ${result.status}`}
                    secondary={result.reason || result.kind}
                  />
                </ListItemButton>
              );
            })}
          </List>
        </Stack>
      ) : null}
    </Stack>
  );
}
