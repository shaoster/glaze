import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
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
import type { OcrRegion } from "../ocrDetection";
import {
  autoDetectOcrRegionForRecord,
  runOcrOnRecord,
} from "./glazeImportToolProcessing";
import {
  clampCrop,
  clampSelectedOcrRegion,
  rotatePt,
} from "./glazeImportToolGeometry";
import {
  detectFoodSafeFromOcrText,
  detectRunsFromOcrText,
  parseOcrSuggestion,
} from "./glazeImportToolOcr";

const MIN_OCR_REGION_SIZE = 24;

type OcrDragState = {
  handle: "move" | "nw" | "ne" | "sw" | "se" | "rotate";
  startRegion: OcrRegion;
  anchorX: number;
  anchorY: number;
  startAngle: number;
};

interface GlazeImportOcrStageProps {
  records: UploadedRecord[];
  selectedRecordId: string | null;
  cropPreviewLoading: boolean;
  cropPreviewUrl: string | null;
  setRecords: Dispatch<SetStateAction<UploadedRecord[]>>;
  setSelectedRecordId: (id: string | null) => void;
  onDelete: (id: string) => void;
  onClearImportResult: () => void;
  onContinueToReview: () => void;
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
  cropPreviewLoading,
  cropPreviewUrl,
  setRecords,
  setSelectedRecordId,
  onDelete,
  onClearImportResult,
  onContinueToReview,
}: GlazeImportOcrStageProps) {
  const ocrStageRef = useRef<HTMLDivElement | null>(null);
  const [runningOcrRecordId, setRunningOcrRecordId] = useState<string | null>(null);
  const [ocrDragState, setOcrDragState] = useState<OcrDragState | null>(null);
  const selectedRecord =
    records.find((record) => record.id === selectedRecordId) ?? null;
  const selectedCrop = selectedRecord?.crop
    ? clampCrop(selectedRecord.dimensions, selectedRecord.crop)
    : null;
  const selectedOcrRegion = clampSelectedOcrRegion(
    selectedCrop,
    selectedRecord?.ocrRegion,
  );
  const ocrStageDisplaySize = 360;
  const ocrStageScale = selectedCrop
    ? Math.min(1, ocrStageDisplaySize / selectedCrop.size)
    : 1;

  useEffect(() => {
    if (!ocrDragState || !selectedRecord || !selectedCrop) return;
    const currentDrag = ocrDragState;
    const cropSize = selectedCrop.size;
    const selectedRecordId = selectedRecord.id;

    function handlePointerMove(event: PointerEvent) {
      if (!ocrStageRef.current) return;
      const rect = ocrStageRef.current.getBoundingClientRect();
      const scale = rect.width / cropSize;
      const sourceX = (event.clientX - rect.left) / scale;
      const sourceY = (event.clientY - rect.top) / scale;

      const start = currentDrag.startRegion;
      let next: OcrRegion = { ...start };
      if (currentDrag.handle === "rotate") {
        const currentAngle = Math.atan2(
          sourceY - currentDrag.anchorY,
          sourceX - currentDrag.anchorX,
        );
        const delta = ((currentAngle - currentDrag.startAngle) * 180) / Math.PI;
        next = { ...start, rotation: start.rotation + delta };
      } else if (currentDrag.handle === "move") {
        next = {
          ...start,
          x: sourceX - currentDrag.anchorX,
          y: sourceY - currentDrag.anchorY,
        };
      } else {
        const fixedSignX =
          currentDrag.handle === "nw" || currentDrag.handle === "sw" ? 1 : -1;
        const fixedSignY =
          currentDrag.handle === "nw" || currentDrag.handle === "ne" ? 1 : -1;
        const cx = start.x + start.width / 2;
        const cy = start.y + start.height / 2;
        const [fRotX, fRotY] = rotatePt(
          (fixedSignX * start.width) / 2,
          (fixedSignY * start.height) / 2,
          start.rotation,
        );
        const fixedX = cx + fRotX;
        const fixedY = cy + fRotY;
        const [localDx, localDy] = rotatePt(
          sourceX - fixedX,
          sourceY - fixedY,
          -start.rotation,
        );
        const width = Math.max(Math.abs(localDx), MIN_OCR_REGION_SIZE);
        const height = Math.max(Math.abs(localDy), MIN_OCR_REGION_SIZE);
        const [newRotFx, newRotFy] = rotatePt(
          (fixedSignX * width) / 2,
          (fixedSignY * height) / 2,
          start.rotation,
        );
        const newCx = fixedX - newRotFx;
        const newCy = fixedY - newRotFy;
        next = {
          ...start,
          x: newCx - width / 2,
          y: newCy - height / 2,
          width,
          height,
        };
      }

      setRecords((current) =>
        current.map((record) =>
          record.id === selectedRecordId
            ? {
                ...record,
                ocrRegion: clampSelectedOcrRegion(selectedCrop, next),
                ocrSuggestion: null,
                ocrStatus: "idle",
                ocrError: null,
                reviewed: false,
              }
            : record,
        ),
      );
    }

    function handlePointerUp() {
      setOcrDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [ocrDragState, selectedCrop, selectedRecord, setRecords]);

  function updateSelectedRecord(updater: (record: UploadedRecord) => UploadedRecord) {
    if (!selectedRecord) return;
    const selectedRecordId = selectedRecord.id;
    setRecords((current) =>
      current.map((record) =>
        record.id === selectedRecordId ? updater(record) : record,
      ),
    );
  }

  async function handleAutoDetectRegion() {
    if (!selectedRecord?.crop) return;
    const { ocrRegion, labelRect } =
      await autoDetectOcrRegionForRecord(selectedRecord);
    updateSelectedRecord((record) => ({
      ...record,
      ocrRegion,
      detectedLabelRect: labelRect,
      ocrSuggestion: null,
      ocrStatus: "idle",
      ocrError: null,
      reviewed: false,
    }));
  }

  async function handleRunOcr(recordId: string) {
    const record = records.find((item) => item.id === recordId);
    if (!record?.crop) return;
    setRunningOcrRecordId(recordId);
    setSelectedRecordId(recordId);
    onClearImportResult();
    setRecords((current) =>
      current.map((item) =>
        item.id === recordId
          ? { ...item, ocrStatus: "running", ocrError: null }
          : item,
      ),
    );
    try {
      const result = await runOcrOnRecord(record);
      const suggestion = parseOcrSuggestion(
        result.text || "",
        record.parsedFields.kind,
      );
      suggestion.confidence = Number.isFinite(result.confidence)
        ? result.confidence
        : null;
      setRecords((current) =>
        current.map((item) =>
          item.id === recordId
            ? {
                ...item,
                ocrSuggestion: suggestion,
                ocrStatus: "done",
                reviewed: false,
                parsedFields: {
                  name: suggestion.suggestedName,
                  kind: suggestion.suggestedKind,
                  first_glaze: suggestion.suggestedFirstGlaze,
                  second_glaze: suggestion.suggestedSecondGlaze,
                  runs:
                    detectRunsFromOcrText(suggestion.rawText) ??
                    item.parsedFields.runs,
                  is_food_safe:
                    detectFoodSafeFromOcrText(suggestion.rawText) ??
                    item.parsedFields.is_food_safe,
                },
              }
            : item,
        ),
      );
    } catch (error) {
      setRecords((current) =>
        current.map((item) =>
          item.id === recordId
            ? {
                ...item,
                ocrStatus: "error",
                ocrError:
                  error instanceof Error ? error.message : String(error),
                reviewed: false,
              }
            : item,
        ),
      );
    } finally {
      setRunningOcrRecordId((current) =>
        current === recordId ? null : current,
      );
    }
  }

  function handleStartOcrDrag(
    handle: OcrDragState["handle"],
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (!selectedRecord?.ocrRegion || !selectedCrop || !ocrStageRef.current) return;
    const rect = ocrStageRef.current.getBoundingClientRect();
    const scale = rect.width / selectedCrop.size;
    const sourceX = (event.clientX - rect.left) / scale;
    const sourceY = (event.clientY - rect.top) / scale;
    const region = selectedRecord.ocrRegion;
    const cx = region.x + region.width / 2;
    const cy = region.y + region.height / 2;
    setOcrDragState({
      handle,
      startRegion: region,
      anchorX: handle === "move" ? sourceX - region.x : cx,
      anchorY: handle === "move" ? sourceY - region.y : cy,
      startAngle:
        handle === "rotate" ? Math.atan2(sourceY - cy, sourceX - cx) : 0,
    });
  }

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
          onSelect={(id) => setSelectedRecordId(id)}
          onDelete={onDelete}
          hideCropChip
          getSecondaryText={buildOcrSecondaryText}
          renderAction={(record) => (
            <Button
              variant="outlined"
              size="small"
              disabled={!record.crop || runningOcrRecordId !== null}
              onClick={() => void handleRunOcr(record.id)}
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
                      updateSelectedRecord((record) => ({
                        ...record,
                        ocrTuning: {
                          ...record.ocrTuning,
                          labelWhiteThreshold: value as number,
                        },
                        reviewed: false,
                      }))
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
                      updateSelectedRecord((record) => ({
                        ...record,
                        ocrTuning: {
                          ...record.ocrTuning,
                          textDarkThreshold: 0.2 + 0.85 - (value as number),
                        },
                        reviewed: false,
                      }))
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
                  onClick={() => void handleAutoDetectRegion()}
                >
                  Auto-detect Region
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  disabled={!selectedRecord.crop || runningOcrRecordId !== null}
                  onClick={() => void handleRunOcr(selectedRecord.id)}
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
                        data-testid="ocr-selection"
                        onPointerDown={(event) => handleStartOcrDrag("move", event)}
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
                          data-testid="ocr-handle-rotate"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            handleStartOcrDrag("rotate", event);
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
                            data-testid={`ocr-handle-${handle}`}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              handleStartOcrDrag(handle, event);
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
