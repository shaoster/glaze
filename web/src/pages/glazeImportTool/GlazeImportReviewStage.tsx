import type { Dispatch, SetStateAction } from "react";
import { Alert, Box, Button, Divider, Stack, TextField, Typography } from "@mui/material";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import GlazeImportRecordList from "./GlazeImportRecordList";
import { COMBO_NAME_SEPARATOR } from "./glazeImportToolOcr";
import type { UploadedRecord } from "./glazeImportToolTypes";

interface GlazeImportReviewStageProps {
  records: UploadedRecord[];
  selectedRecordId: string | null;
  cropPreviewLoading: boolean;
  cropPreviewUrl: string | null;
  allReviewed: boolean;
  setRecords: Dispatch<SetStateAction<UploadedRecord[]>>;
  setSelectedRecordId: (id: string | null) => void;
  onDelete: (id: string) => void;
  onContinueToImport: () => void;
}

export default function GlazeImportReviewStage({
  records,
  selectedRecordId,
  cropPreviewLoading,
  cropPreviewUrl,
  allReviewed,
  setRecords,
  setSelectedRecordId,
  onDelete,
  onContinueToImport,
}: GlazeImportReviewStageProps) {
  const selectedRecord =
    records.find((record) => record.id === selectedRecordId) ?? null;

  function updateSelectedRecord(updater: (record: UploadedRecord) => UploadedRecord) {
    if (!selectedRecord) return;
    setRecords((current) =>
      current.map((record) =>
        record.id === selectedRecord.id ? updater(record) : record,
      ),
    );
  }

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Every record starts unreviewed after OCR. Fix any parsing issues, then
        mark each record reviewed when it is ready for import.
      </Alert>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", lg: "320px minmax(0, 1fr)" },
        }}
      >
        <GlazeImportRecordList
          records={records}
          selectedId={selectedRecordId}
          onSelect={setSelectedRecordId}
          onDelete={onDelete}
          showReviewed
        />
        {selectedRecord ? (
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Cropped Preview
                </Typography>
                <Box
                  sx={{
                    border: (theme) => `1px solid ${theme.palette.divider}`,
                    borderRadius: 3,
                    aspectRatio: "1 / 1",
                    overflow: "hidden",
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "rgba(255,255,255,0.06)",
                  }}
                >
                  {cropPreviewLoading ? (
                    <Typography color="text.secondary">Loading preview…</Typography>
                  ) : cropPreviewUrl ? (
                    <Box
                      component="img"
                      src={cropPreviewUrl}
                      alt="Reviewed crop preview"
                      sx={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  ) : null}
                </Box>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }}>
                  <Typography variant="subtitle1">OCR Raw Text</Typography>
                  {selectedRecord.ocrSuggestion?.confidence != null ? (
                    <Typography variant="body2" color="text.secondary">
                      confidence: {Math.round(selectedRecord.ocrSuggestion.confidence)}%
                    </Typography>
                  ) : null}
                </Stack>
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    minHeight: 220,
                    bgcolor: "rgba(255,255,255,0.05)",
                    whiteSpace: "pre-wrap",
                    fontFamily: "monospace",
                    fontSize: "0.8rem",
                  }}
                >
                  {selectedRecord.ocrSuggestion?.rawText ||
                    selectedRecord.ocrError ||
                    "No OCR output."}
                </Box>
              </Box>
            </Stack>
            <Divider />
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Parsed name"
                fullWidth
                value={selectedRecord.parsedFields.name}
                disabled={selectedRecord.parsedFields.kind === "glaze_combination"}
                helperText={
                  selectedRecord.parsedFields.kind === "glaze_combination"
                    ? "Auto-computed from glaze fields"
                    : undefined
                }
                onChange={(event) =>
                  updateSelectedRecord((record) => ({
                    ...record,
                    parsedFields: {
                      ...record.parsedFields,
                      name: event.target.value,
                    },
                    reviewed: false,
                  }))
                }
              />
              <TextField
                label="Parsed kind"
                select
                fullWidth
                slotProps={{ select: { native: true } }}
                value={selectedRecord.parsedFields.kind}
                onChange={(event) =>
                  updateSelectedRecord((record) => {
                    const kind = event.target.value as UploadedRecord["parsedFields"]["kind"];
                    const name =
                      kind === "glaze_combination"
                        ? `${record.parsedFields.first_glaze}${COMBO_NAME_SEPARATOR}${record.parsedFields.second_glaze}`
                        : record.parsedFields.name;
                    return {
                      ...record,
                      parsedFields: { ...record.parsedFields, kind, name },
                      reviewed: false,
                    };
                  })
                }
              >
                <option value="glaze_type">glaze_type</option>
                <option value="glaze_combination">glaze_combination</option>
              </TextField>
            </Stack>
            {selectedRecord.parsedFields.kind === "glaze_combination" ? (
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  label="Parsed 1st glaze"
                  fullWidth
                  value={selectedRecord.parsedFields.first_glaze}
                  onChange={(event) =>
                    updateSelectedRecord((record) => {
                      const first_glaze = event.target.value;
                      const name = `${first_glaze}${COMBO_NAME_SEPARATOR}${record.parsedFields.second_glaze}`;
                      return {
                        ...record,
                        parsedFields: {
                          ...record.parsedFields,
                          first_glaze,
                          name,
                        },
                        reviewed: false,
                      };
                    })
                  }
                />
                <TextField
                  label="Parsed 2nd glaze"
                  fullWidth
                  value={selectedRecord.parsedFields.second_glaze}
                  onChange={(event) =>
                    updateSelectedRecord((record) => {
                      const second_glaze = event.target.value;
                      const name = `${record.parsedFields.first_glaze}${COMBO_NAME_SEPARATOR}${second_glaze}`;
                      return {
                        ...record,
                        parsedFields: {
                          ...record.parsedFields,
                          second_glaze,
                          name,
                        },
                        reviewed: false,
                      };
                    })
                  }
                />
              </Stack>
            ) : null}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Runs?"
                select
                fullWidth
                slotProps={{
                  select: { native: true },
                  inputLabel: { shrink: true },
                }}
                value={
                  selectedRecord.parsedFields.runs === null
                    ? ""
                    : String(selectedRecord.parsedFields.runs)
                }
                helperText={
                  selectedRecord.parsedFields.runs === null ? "Not specified" : undefined
                }
                onChange={(event) =>
                  updateSelectedRecord((record) => ({
                    ...record,
                    parsedFields: {
                      ...record.parsedFields,
                      runs:
                        event.target.value === ""
                          ? null
                          : event.target.value === "true",
                    },
                    reviewed: false,
                  }))
                }
              >
                <option value="" />
                <option value="true">Yes</option>
                <option value="false">No</option>
              </TextField>
              <TextField
                label="Food safe?"
                select
                fullWidth
                slotProps={{
                  select: { native: true },
                  inputLabel: { shrink: true },
                }}
                value={
                  selectedRecord.parsedFields.is_food_safe === null
                    ? ""
                    : String(selectedRecord.parsedFields.is_food_safe)
                }
                helperText={
                  selectedRecord.parsedFields.is_food_safe === null
                    ? "Not specified"
                    : undefined
                }
                onChange={(event) =>
                  updateSelectedRecord((record) => ({
                    ...record,
                    parsedFields: {
                      ...record.parsedFields,
                      is_food_safe:
                        event.target.value === ""
                          ? null
                          : event.target.value === "true",
                    },
                    reviewed: false,
                  }))
                }
              >
                <option value="" />
                <option value="true">Yes</option>
                <option value="false">No</option>
              </TextField>
            </Stack>
            <Button
              variant={selectedRecord.reviewed ? "contained" : "outlined"}
              color={selectedRecord.reviewed ? "success" : "primary"}
              size="large"
              startIcon={<FactCheckIcon />}
              onClick={() =>
                updateSelectedRecord((record) => ({
                  ...record,
                  reviewed: !record.reviewed,
                }))
              }
              sx={{ alignSelf: "flex-start", minHeight: 52, px: 3 }}
            >
              {selectedRecord.reviewed
                ? "Reviewed for import"
                : "Mark reviewed for import"}
            </Button>
            {allReviewed ? (
              <Button variant="contained" onClick={onContinueToImport}>
                Continue To Import
              </Button>
            ) : null}
          </Stack>
        ) : (
          <Typography color="text.secondary">
            Select a record to review it.
          </Typography>
        )}
      </Box>
    </Stack>
  );
}
