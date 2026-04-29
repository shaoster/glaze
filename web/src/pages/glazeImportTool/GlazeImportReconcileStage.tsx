import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import type { ManualSquareCropImportResponse } from "../../util/api";
import type { UploadedRecord } from "./glazeImportToolTypes";

interface GlazeImportReconcileStageProps {
  duplicateResults: ManualSquareCropImportResponse["results"];
  records: UploadedRecord[];
  reconciledIds: Set<string>;
  onToggleResolved: (clientId: string, checked: boolean) => void;
}

export default function GlazeImportReconcileStage({
  duplicateResults,
  records,
  reconciledIds,
  onToggleResolved,
}: GlazeImportReconcileStageProps) {
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        These records were skipped because an entry with the same name already
        exists in the public library. Review the scraped data below, open the
        existing record in the admin, and update it manually if needed. Check
        each record as resolved when done.
      </Alert>
      <Typography variant="body2" color="text.secondary">
        {reconciledIds.size} / {duplicateResults.length} resolved
      </Typography>
      <Stack spacing={2}>
        {duplicateResults.map((result) => {
          const sourceRecord = records.find((record) => record.id === result.client_id);
          const adminPath = result.object_id
            ? `/admin/api/${result.kind.replace("_", "")}/${result.object_id}/change/`
            : null;
          const isResolved = reconciledIds.has(result.client_id);
          return (
            <Box
              key={result.client_id}
              sx={{
                border: (theme) =>
                  `1px solid ${isResolved ? theme.palette.success.main : theme.palette.divider}`,
                borderRadius: 2,
                p: 2,
                opacity: isResolved ? 0.6 : 1,
                transition: "opacity 0.15s, border-color 0.15s",
              }}
            >
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="subtitle1" sx={{ flex: 1 }}>
                    {result.name || result.filename}
                  </Typography>
                  <Chip label={result.kind} size="small" />
                  {adminPath ? (
                    <Button
                      size="small"
                      variant="outlined"
                      href={adminPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      component="a"
                      endIcon={<OpenInNewIcon fontSize="small" />}
                    >
                      Open in Admin
                    </Button>
                  ) : null}
                </Stack>
                {sourceRecord ? (
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                      gap: 1,
                    }}
                  >
                    {Object.entries(sourceRecord.parsedFields).map(([key, value]) => (
                      <Box key={key}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block"
                        >
                          {key.replace(/_/g, " ")}
                        </Typography>
                        <Typography variant="body2">
                          {value === null ? "—" : String(value)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                ) : null}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={isResolved}
                      onChange={(event) =>
                        onToggleResolved(result.client_id, event.target.checked)
                      }
                    />
                  }
                  label="Resolved"
                />
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}
