import type { RefObject } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Slider,
  Stack,
  Typography,
} from "@mui/material";
import GlazeImportRecordList from "./GlazeImportRecordList";
import type { UploadedRecord } from "./glazeImportToolTypes";
import type { OcrRegion, CropSquare } from "../ocrDetection";

interface GlazeImportOcrStageProps {
  records: UploadedRecord[];
  selectedRecordId: string | null;
  selectedRecord: UploadedRecord | null;
  selectedCrop: CropSquare | null;
  selectedOcrRegion: OcrRegion | null;
  cropPreviewLoading: boolean;
  cropPreviewUrl: string | null;
  ocrStageRef: RefObject<HTMLDivElement | null>;
  ocrStageScale: number;
  runningOcrRecordId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onAutoDetectRegion: () => void;
  onRunOcr: (id: string) => void;
  onContinueToReview: () => void;
  onStartOcrDrag: (
    handle: "move" | "nw" | "ne" | "sw" | "se" | "rotate",
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onUpdateSelectedLabelSensitivity: (value: number) => void;
  onUpdateSelectedTextSensitivity: (value: number) => void;
}

function buildOcrSecondaryText(record: UploadedRecord) {
  if (record.ocrError) return record.ocrError;
  if (!record.ocrSuggestion) return "Run OCR for parsed text and confidence.";
  const parsedName = record.ocrSuggestion.suggestedName || "No parsed name";
  const confidence =
    record.ocrSuggestion.confidence != null
      ? `${Math.round(record.ocrSuggestion.confidence)}%`
      : "n/a";
  return `${parsedName} • confidence ${confidence}`;
}

export default function GlazeImportOcrStage({
  records,
  selectedRecordId,
  selectedRecord,
  selectedCrop,
  selectedOcrRegion,
  cropPreviewLoading,
  cropPreviewUrl,
  ocrStageRef,
  ocrStageScale,
  runningOcrRecordId,
  onSelect,
  onDelete,
  onAutoDetectRegion,
  onRunOcr,
  onContinueToReview,
  onStartOcrDrag,
  onUpdateSelectedLabelSensitivity,
  onUpdateSelectedTextSensitivity,
}: GlazeImportOcrStageProps) {
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Each record keeps its own OCR tuning. Select a record, auto-detect or
        drag the yellow region, then run OCR for that entry when you are ready.
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
          onSelect={onSelect}
          onDelete={onDelete}
          hideCropChip
          getSecondaryText={buildOcrSecondaryText}
          renderAction={(record) => (
            <Button
              variant="outlined"
              size="small"
              disabled={!record.crop || runningOcrRecordId !== null}
              onClick={() => onRunOcr(record.id)}
            >
              {record.ocrSuggestion ? "Re-run OCR" : "Run OCR"}
            </Button>
          )}
        />
        <Stack spacing={2}>
          {selectedRecord ? (
            <>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" gutterBottom>
                    Label sensitivity:{" "}
                    {selectedRecord.ocrTuning.labelWhiteThreshold.toFixed(2)}
                  </Typography>
                  <Slider
                    min={0.5}
                    max={0.98}
                    step={0.01}
                    value={selectedRecord.ocrTuning.labelWhiteThreshold}
                    onChange={(_, value) =>
                      onUpdateSelectedLabelSensitivity(value as number)
                    }
                    size="small"
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" gutterBottom>
                    Text sensitivity:{" "}
                    {(
                      0.2 +
                      0.85 -
                      selectedRecord.ocrTuning.textDarkThreshold
                    ).toFixed(2)}
                  </Typography>
                  <Slider
                    min={0.2}
                    max={0.85}
                    step={0.01}
                    value={0.2 + 0.85 - selectedRecord.ocrTuning.textDarkThreshold}
                    onChange={(_, value) =>
                      onUpdateSelectedTextSensitivity(
                        0.2 + 0.85 - (value as number),
                      )
                    }
                    size="small"
                  />
                </Box>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                <Chip label={selectedRecord.filename} />
                <Button
                  variant="outlined"
                  size="small"
                  disabled={!selectedRecord.crop}
                  onClick={onAutoDetectRegion}
                >
                  Auto-detect Region
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  disabled={!selectedRecord.crop || runningOcrRecordId !== null}
                  onClick={() => onRunOcr(selectedRecord.id)}
                >
                  {selectedRecord.ocrSuggestion ? "Re-run OCR" : "Run OCR"}
                </Button>
                {runningOcrRecordId === selectedRecord.id ? (
                  <CircularProgress size={18} />
                ) : null}
              </Stack>
              {cropPreviewLoading ? (
                <CircularProgress size={32} sx={{ alignSelf: "flex-start", m: 1 }} />
              ) : cropPreviewUrl && selectedCrop ? (
                <Box
                  sx={{
                    border: (theme) => `1px solid ${theme.palette.divider}`,
                    borderRadius: 3,
                    overflow: "hidden",
                    display: "inline-block",
                    bgcolor: "rgba(255,255,255,0.06)",
                    touchAction: "none",
                    alignSelf: "flex-start",
                  }}
                >
                  <Box
                    ref={ocrStageRef}
                    sx={{
                      position: "relative",
                      width: selectedCrop.size * ocrStageScale,
                      height: selectedCrop.size * ocrStageScale,
                    }}
                  >
                    <Box
                      component="img"
                      src={cropPreviewUrl}
                      alt="OCR region selector"
                      sx={{
                        display: "block",
                        width: "100%",
                        height: "100%",
                        userSelect: "none",
                        WebkitUserDrag: "none",
                      }}
                    />
                    {selectedOcrRegion ? (
                      <Box
                        onPointerDown={(event) => onStartOcrDrag("move", event)}
                        sx={{
                          position: "absolute",
                          left: selectedOcrRegion.x * ocrStageScale,
                          top: selectedOcrRegion.y * ocrStageScale,
                          width: selectedOcrRegion.width * ocrStageScale,
                          height: selectedOcrRegion.height * ocrStageScale,
                          transform: `rotate(${selectedOcrRegion.rotation}deg)`,
                          transformOrigin: "center",
                          border: "2px solid #f0c040",
                          boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.38)",
                          cursor: "move",
                          bgcolor: "rgba(240, 192, 64, 0.08)",
                        }}
                      >
                        <Box
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            onStartOcrDrag("rotate", event);
                          }}
                          sx={{
                            position: "absolute",
                            left: "50%",
                            top: -26,
                            transform: "translateX(-50%)",
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            bgcolor: "#2196f3",
                            border: "2px solid #7a6010",
                            cursor: "grab",
                            "&:active": { cursor: "grabbing" },
                          }}
                        />
                        {(["nw", "ne", "sw", "se"] as const).map((handle) => (
                          <Box
                            key={handle}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              onStartOcrDrag(handle, event);
                            }}
                            sx={{
                              position: "absolute",
                              width: 14,
                              height: 14,
                              borderRadius: "50%",
                              bgcolor: "#f0c040",
                              border: "2px solid #7a6010",
                              ...(handle === "nw"
                                ? {
                                    left: -7,
                                    top: -7,
                                    cursor: "nwse-resize",
                                  }
                                : {}),
                              ...(handle === "ne"
                                ? {
                                    right: -7,
                                    top: -7,
                                    cursor: "nesw-resize",
                                  }
                                : {}),
                              ...(handle === "sw"
                                ? {
                                    left: -7,
                                    bottom: -7,
                                    cursor: "nesw-resize",
                                  }
                                : {}),
                              ...(handle === "se"
                                ? {
                                    right: -7,
                                    bottom: -7,
                                    cursor: "nwse-resize",
                                  }
                                : {}),
                            }}
                          />
                        ))}
                      </Box>
                    ) : null}
                  </Box>
                </Box>
              ) : (
                <Typography color="text.secondary">
                  Crop this record first to set an OCR region.
                </Typography>
              )}
              {selectedRecord.ocrSuggestion ? (
                <Stack spacing={1}>
                  <Typography variant="subtitle2">Last OCR result</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Parsed as:{" "}
                    {selectedRecord.ocrSuggestion.suggestedName || "No parsed name"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Confidence:{" "}
                    {selectedRecord.ocrSuggestion.confidence != null
                      ? `${Math.round(selectedRecord.ocrSuggestion.confidence)}%`
                      : "n/a"}
                  </Typography>
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      bgcolor: "rgba(255,255,255,0.05)",
                      whiteSpace: "pre-wrap",
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                    }}
                  >
                    {selectedRecord.ocrSuggestion.rawText || "No text found."}
                  </Box>
                </Stack>
              ) : null}
              {selectedRecord.ocrError ? (
                <Alert severity="error">{selectedRecord.ocrError}</Alert>
              ) : null}
            </>
          ) : (
            <Typography color="text.secondary">
              Select a record to set its OCR region.
            </Typography>
          )}
        </Stack>
      </Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Button variant="outlined" onClick={onContinueToReview}>
          Continue To Review
        </Button>
      </Stack>
    </Stack>
  );
}
