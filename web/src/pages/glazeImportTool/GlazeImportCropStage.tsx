import {
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import { Cropper, RectangleStencil, ImageRestriction } from "react-advanced-cropper";
import type { CropperRef } from "react-advanced-cropper";
import "react-advanced-cropper/dist/style.css";
import GlazeImportRecordList from "./GlazeImportRecordList";
import type { UploadedRecord } from "./glazeImportToolTypes";
import {
  clampCrop,
  defaultCrop,
  defaultCropOcrRegion,
} from "./glazeImportToolGeometry";

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
  // Crop rotation is only ever seeded from the selected record; this stage has
  // no rotation control. The cropper manages its own pan/zoom internally.
  const [rotation, setRotation] = useState(0);

  const selectedRecord =
    records.find((record) => record.id === selectedRecordId) ?? null;
  const selectedCrop = selectedRecord?.crop
    ? clampCrop(selectedRecord.dimensions, selectedRecord.crop)
    : null;

  function handleCropChange(cropper: CropperRef) {
    if (!selectedRecord) return;
    const coords = cropper.getCoordinates();
    if (!coords) return;
    // The import swatch is square by design (#146): aspectRatio={1} keeps
    // width === height, so a single `size` captures the crop.
    const next = clampCrop(selectedRecord.dimensions, {
      x: coords.left,
      y: coords.top,
      size: coords.width,
      rotation,
    });
    // react-advanced-cropper's onChange fires continuously; skip the update
    // (and the OCR-state reset below) when the clamped crop is unchanged.
    const prev = selectedRecord.crop;
    if (
      prev &&
      prev.x === next.x &&
      prev.y === next.y &&
      prev.size === next.size &&
      prev.rotation === next.rotation
    ) {
      return;
    }
    setRecords((current) =>
      current.map((record) =>
        record.id === selectedRecord.id
          ? {
              ...record,
              crop: next,
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

  function handleResetCrop() {
    if (!selectedRecord) return;
    setRotation(0);
    setRecords((current) =>
      current.map((record) => {
        if (record.id !== selectedRecord.id) return record;
        const crop = clampCrop(
          record.dimensions,
          defaultCrop(record.dimensions),
        );
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

  // Container height for the Cropper: fixed 500px
  const CROPPER_HEIGHT = 500;

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
            onSelect={(id) => {
              const record = records.find((r) => r.id === id);
              setRotation(record?.crop?.rotation ?? 0);
              setSelectedRecordId(id);
            }}
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
                    overflow: "hidden",
                    bgcolor: "#181511",
                  }}
                >
                  <Box
                    data-testid="crop-selection"
                    sx={{
                      position: "relative",
                      width: "100%",
                      height: CROPPER_HEIGHT,
                    }}
                  >
                    <Cropper
                      key={selectedRecord.id}
                      src={selectedRecord.sourceUrl}
                      stencilComponent={RectangleStencil}
                      // Square swatch by design (#146) — keep the 1:1 lock.
                      stencilProps={{ aspectRatio: 1, grid: true }}
                      imageRestriction={ImageRestriction.none}
                      style={{ width: "100%", height: "100%" }}
                      defaultSize={
                        selectedCrop
                          ? {
                              width: selectedCrop.size,
                              height: selectedCrop.size,
                            }
                          : undefined
                      }
                      defaultPosition={
                        selectedCrop
                          ? { left: selectedCrop.x, top: selectedCrop.y }
                          : undefined
                      }
                      onChange={handleCropChange}
                    />
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
              <Typography
                color="text.secondary"
                sx={{ p: 2, textAlign: "center" }}
              >
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
