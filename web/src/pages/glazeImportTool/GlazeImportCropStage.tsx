import type { RefObject } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import GlazeImportRecordList from "./GlazeImportRecordList";
import type { UploadedRecord } from "./glazeImportToolTypes";
import type { CropSquare } from "../ocrDetection";

interface GlazeImportCropStageProps {
  records: UploadedRecord[];
  selectedRecordId: string | null;
  selectedRecord: UploadedRecord | null;
  selectedCrop: CropSquare | null;
  allCropped: boolean;
  cropPreviewLoading: boolean;
  cropPreviewUrl: string | null;
  cropStageRef: RefObject<HTMLDivElement | null>;
  selectedPadding: number;
  selectedStageWidth: number;
  selectedStageHeight: number;
  selectedStageScale: number;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onBackToRecords: () => void;
  onResetCrop: () => void;
  onContinueToOcr: () => void;
  onStartCropDrag: (
    handle: "move" | "nw" | "ne" | "sw" | "se" | "rotate",
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
}

export default function GlazeImportCropStage({
  records,
  selectedRecordId,
  selectedRecord,
  selectedCrop,
  allCropped,
  cropPreviewLoading,
  cropPreviewUrl,
  cropStageRef,
  selectedPadding,
  selectedStageWidth,
  selectedStageHeight,
  selectedStageScale,
  onSelect,
  onDelete,
  onBackToRecords,
  onResetCrop,
  onContinueToOcr,
  onStartCropDrag,
}: GlazeImportCropStageProps) {
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
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ) : (
          <Stack spacing={2}>
            {selectedRecord ? (
              <>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button
                    onClick={(event) => {
                      onBackToRecords();
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
                    onClick={onResetCrop}
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
                        onPointerDown={(event) => onStartCropDrag("move", event)}
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
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            onStartCropDrag("rotate", event);
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
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              onStartCropDrag(handle, event);
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
