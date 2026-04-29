import { useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import GlazeImportRecordList from "./GlazeImportRecordList";
import type { UploadedRecord } from "./glazeImportToolTypes";
import type { CropSquare } from "../ocrDetection";
import {
  clampCrop,
  defaultCrop,
  defaultCropOcrRegion,
  getViewportPadding,
  MIN_CROP_SIZE,
  rotatePt,
} from "./glazeImportToolGeometry";

type CropDragState = {
  handle: "move" | "nw" | "ne" | "sw" | "se" | "rotate";
  startCrop: CropSquare;
  anchorX: number;
  anchorY: number;
  startAngle: number;
};

interface GlazeImportCropStageProps {
  records: UploadedRecord[];
  selectedRecordId: string | null;
  allCropped: boolean;
  cropPreviewLoading: boolean;
  cropPreviewUrl: string | null;
  setRecords: Dispatch<SetStateAction<UploadedRecord[]>>;
  setSelectedRecordId: (id: string | null) => void;
  onDelete: (id: string) => void;
  onContinueToOcr: () => void;
}

export default function GlazeImportCropStage({
  records,
  selectedRecordId,
  allCropped,
  cropPreviewLoading,
  cropPreviewUrl,
  setRecords,
  setSelectedRecordId,
  onDelete,
  onContinueToOcr,
}: GlazeImportCropStageProps) {
  const cropStageRef = useRef<HTMLDivElement | null>(null);
  const [cropDragState, setCropDragState] = useState<CropDragState | null>(null);
  const selectedRecord =
    records.find((record) => record.id === selectedRecordId) ?? null;
  const selectedCrop = selectedRecord?.crop
    ? clampCrop(selectedRecord.dimensions, selectedRecord.crop)
    : null;
  const selectedPadding = selectedRecord
    ? getViewportPadding(selectedRecord.dimensions)
    : 0;
  const selectedStageWidth = selectedRecord
    ? selectedRecord.dimensions.width + selectedPadding * 2
    : 1;
  const selectedStageHeight = selectedRecord
    ? selectedRecord.dimensions.height + selectedPadding * 2
    : 1;
  const selectedStageScale = selectedRecord
    ? Math.min(1, 760 / Math.max(selectedStageWidth, selectedStageHeight))
    : 1;

  useEffect(() => {
    if (!cropDragState || !selectedRecord || !selectedRecord.crop) return;
    const currentDrag = cropDragState;
    const selectedRecordId = selectedRecord.id;
    const selectedDimensions = selectedRecord.dimensions;

    function handlePointerMove(event: PointerEvent) {
      if (!cropStageRef.current) return;
      const rect = cropStageRef.current.getBoundingClientRect();
      const padding = getViewportPadding(selectedDimensions);
      const stageScale = rect.width / (selectedDimensions.width + padding * 2);
      const sourceX = (event.clientX - rect.left) / stageScale - padding;
      const sourceY = (event.clientY - rect.top) / stageScale - padding;

      const start = currentDrag.startCrop;
      let nextCrop: CropSquare = { ...start };
      if (currentDrag.handle === "rotate") {
        const currentAngle = Math.atan2(
          sourceY - currentDrag.anchorY,
          sourceX - currentDrag.anchorX,
        );
        const delta = ((currentAngle - currentDrag.startAngle) * 180) / Math.PI;
        nextCrop = { ...start, rotation: start.rotation + delta };
      } else if (currentDrag.handle === "move") {
        nextCrop = {
          ...start,
          x: sourceX - currentDrag.anchorX,
          y: sourceY - currentDrag.anchorY,
        };
      } else {
        const fixedSignX =
          currentDrag.handle === "nw" || currentDrag.handle === "sw" ? 1 : -1;
        const fixedSignY =
          currentDrag.handle === "nw" || currentDrag.handle === "ne" ? 1 : -1;
        const cx = start.x + start.size / 2;
        const cy = start.y + start.size / 2;
        const [fRotX, fRotY] = rotatePt(
          (fixedSignX * start.size) / 2,
          (fixedSignY * start.size) / 2,
          start.rotation,
        );
        const fixedX = cx + fRotX;
        const fixedY = cy + fRotY;
        const [localDx, localDy] = rotatePt(
          sourceX - fixedX,
          sourceY - fixedY,
          -start.rotation,
        );
        const size = Math.max(Math.abs(localDx), Math.abs(localDy), MIN_CROP_SIZE);
        const [newRotFx, newRotFy] = rotatePt(
          (fixedSignX * size) / 2,
          (fixedSignY * size) / 2,
          start.rotation,
        );
        const newCx = fixedX - newRotFx;
        const newCy = fixedY - newRotFy;
        nextCrop = { ...start, x: newCx - size / 2, y: newCy - size / 2, size };
      }

      setRecords((current) =>
        current.map((record) =>
          record.id === selectedRecordId
            ? {
                ...record,
                crop: clampCrop(record.dimensions, nextCrop),
                cropped: true,
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
      setCropDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [cropDragState, selectedRecord, setRecords]);

  function handleResetCrop() {
    if (!selectedRecord) return;
    setRecords((current) =>
      current.map((record) => {
        if (record.id !== selectedRecord.id) return record;
        const crop = clampCrop(record.dimensions, defaultCrop(record.dimensions));
        return {
          ...record,
          crop,
          ocrRegion: defaultCropOcrRegion(crop),
          detectedLabelRect: null,
          reviewed: false,
          ocrSuggestion: null,
          ocrStatus: "idle",
          ocrError: null,
        };
      }),
    );
  }

  function handleStartCropDrag(
    handle: CropDragState["handle"],
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (!selectedRecord?.crop || !cropStageRef.current) return;
    const rect = cropStageRef.current.getBoundingClientRect();
    const padding = getViewportPadding(selectedRecord.dimensions);
    const stageScale =
      rect.width / (selectedRecord.dimensions.width + padding * 2);
    const sourceX = (event.clientX - rect.left) / stageScale - padding;
    const sourceY = (event.clientY - rect.top) / stageScale - padding;
    const crop = selectedRecord.crop;
    const cx = crop.x + crop.size / 2;
    const cy = crop.y + crop.size / 2;
    setCropDragState({
      handle,
      startCrop: crop,
      anchorX: handle === "move" ? sourceX - crop.x : cx,
      anchorY: handle === "move" ? sourceY - crop.y : cy,
      startAngle:
        handle === "rotate" ? Math.atan2(sourceY - cy, sourceX - cx) : 0,
    });
  }

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Each image starts with a default crop covering the full image. Drag the
        white box to adjust the crop region. The crop square can extend beyond
        the image bounds; any overflow becomes transparent in the final crop.
      </Alert>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 320px" },
        }}
      >
        {selectedRecordId == null ? (
          <GlazeImportRecordList
            records={records}
            selectedId={selectedRecordId}
            onSelect={setSelectedRecordId}
            onDelete={onDelete}
          />
        ) : (
          <Stack spacing={2}>
            {selectedRecord ? (
              <>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button
                    onClick={(event) => {
                      setSelectedRecordId(null);
                      event.stopPropagation();
                    }}
                  >
                    ← Back to Records
                  </Button>
                  <Chip label={selectedRecord.filename} />
                  <Chip
                    label={selectedRecord.cropped ? "cropped" : "uncropped"}
                    color={selectedRecord.cropped ? "success" : "default"}
                  />
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button
                    variant="outlined"
                    onClick={handleResetCrop}
                    disabled={!selectedRecord.crop}
                  >
                    Reset Crop
                  </Button>
                  {allCropped ? (
                    <Button variant="outlined" onClick={onContinueToOcr}>
                      Continue To OCR
                    </Button>
                  ) : null}
                </Stack>
                <Box
                  sx={{
                    border: (theme) => `1px solid ${theme.palette.divider}`,
                    borderRadius: 3,
                    overflow: "auto",
                    p: 2,
                    bgcolor: "#181511",
                  }}
                >
                  <Box
                    ref={cropStageRef}
                    sx={{
                      position: "relative",
                      width: selectedStageWidth * selectedStageScale,
                      height: selectedStageHeight * selectedStageScale,
                      mx: "auto",
                      touchAction: "none",
                      backgroundImage:
                        "linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.04) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.04) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.04) 75%)",
                      backgroundSize: "24px 24px",
                      backgroundPosition:
                        "0 0, 0 12px, 12px -12px, -12px 0px",
                    }}
                  >
                    <Box
                      component="img"
                      src={selectedRecord.sourceUrl}
                      alt={selectedRecord.filename}
                      sx={{
                        position: "absolute",
                        left: selectedPadding * selectedStageScale,
                        top: selectedPadding * selectedStageScale,
                        width: selectedRecord.dimensions.width * selectedStageScale,
                        height:
                          selectedRecord.dimensions.height * selectedStageScale,
                        userSelect: "none",
                        WebkitUserDrag: "none",
                      }}
                    />
                    {selectedCrop ? (
                      <Box
                        data-testid="crop-selection"
                        onPointerDown={(event) => handleStartCropDrag("move", event)}
                        sx={{
                          position: "absolute",
                          left: (selectedCrop.x + selectedPadding) * selectedStageScale,
                          top: (selectedCrop.y + selectedPadding) * selectedStageScale,
                          width: selectedCrop.size * selectedStageScale,
                          height: selectedCrop.size * selectedStageScale,
                          transform: `rotate(${selectedCrop.rotation}deg)`,
                          transformOrigin: "center",
                          border: "2px solid white",
                          boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.42)",
                          cursor: "move",
                          bgcolor: "rgba(255,255,255,0.08)",
                          "&::before, &::after": {
                            content: '""',
                            position: "absolute",
                            bgcolor: "rgba(255,255,255,0.72)",
                          },
                          "&::before": {
                            left: "50%",
                            top: 0,
                            width: "1px",
                            height: "100%",
                            transform: "translateX(-50%)",
                          },
                          "&::after": {
                            top: "50%",
                            left: 0,
                            width: "100%",
                            height: "1px",
                            transform: "translateY(-50%)",
                          },
                        }}
                      >
                        <Box
                          data-testid="crop-handle-rotate"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            handleStartCropDrag("rotate", event);
                          }}
                          sx={{
                            position: "absolute",
                            left: "50%",
                            top: -30,
                            transform: "translateX(-50%)",
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            bgcolor: "#2196f3",
                            border: "2px solid white",
                            cursor: "grab",
                            "&:active": { cursor: "grabbing" },
                          }}
                        />
                        {(["nw", "ne", "sw", "se"] as const).map((handle) => (
                          <Box
                            key={handle}
                            data-testid={`crop-handle-${handle}`}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              handleStartCropDrag(handle, event);
                            }}
                            sx={{
                              position: "absolute",
                              width: 16,
                              height: 16,
                              borderRadius: "50%",
                              bgcolor: "white",
                              border: "2px solid #8f4e21",
                              ...(handle === "nw"
                                ? { left: -8, top: -8, cursor: "nwse-resize" }
                                : {}),
                              ...(handle === "ne"
                                ? { right: -8, top: -8, cursor: "nesw-resize" }
                                : {}),
                              ...(handle === "sw"
                                ? { left: -8, bottom: -8, cursor: "nesw-resize" }
                                : {}),
                              ...(handle === "se"
                                ? { right: -8, bottom: -8, cursor: "nwse-resize" }
                                : {}),
                            }}
                          />
                        ))}
                      </Box>
                    ) : null}
                  </Box>
                </Box>
              </>
            ) : (
              <Typography color="text.secondary">
                Select a record to crop it.
              </Typography>
            )}
          </Stack>
        )}
        <Stack spacing={2}>
          <Typography variant="subtitle1">Crop Preview</Typography>
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
              <CircularProgress size={32} />
            ) : cropPreviewUrl ? (
              <Box
                component="img"
                src={cropPreviewUrl}
                alt="Crop preview"
                sx={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <Typography color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
                Create a crop to preview the transparency-safe square result.
              </Typography>
            )}
          </Box>
          {selectedRecord ? (
            <>
              <Typography variant="body2" color="text.secondary">
                Source: {selectedRecord.dimensions.width} ×{" "}
                {selectedRecord.dimensions.height}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Crop:{" "}
                {selectedCrop
                  ? `${selectedCrop.x}, ${selectedCrop.y}, ${selectedCrop.size}`
                  : "not set"}
              </Typography>
            </>
          ) : null}
        </Stack>
      </Box>
    </Stack>
  );
}
