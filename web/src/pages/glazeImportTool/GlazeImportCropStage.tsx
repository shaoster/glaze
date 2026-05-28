import {
  useReducer,
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
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import GlazeImportRecordList from "./GlazeImportRecordList";
import type { UploadedRecord } from "./glazeImportToolTypes";
import type { CropSquare } from "../ocrDetection";
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

type CropEditorState = {
  crop: { x: number; y: number };
  zoom: number;
  rotation: number;
};

type CropEditorAction =
  | { type: "CROP_CHANGE"; crop: { x: number; y: number } }
  | { type: "ZOOM_CHANGE"; zoom: number }
  | { type: "ROTATION_CHANGE"; rotation: number }
  | { type: "RECORD_SELECTED" };

function cropEditorReducer(
  state: CropEditorState,
  action: CropEditorAction,
): CropEditorState {
  switch (action.type) {
    case "CROP_CHANGE":
      return { ...state, crop: action.crop };
    case "ZOOM_CHANGE":
      return { ...state, zoom: action.zoom };
    case "ROTATION_CHANGE":
      return { ...state, rotation: action.rotation };
    case "RECORD_SELECTED":
      return { crop: { x: 0, y: 0 }, zoom: 1, rotation: 0 };
  }
}

const INITIAL_CROP_EDITOR: CropEditorState = {
  crop: { x: 0, y: 0 },
  zoom: 1,
  rotation: 0,
};

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
  const [cropEditor, dispatchCropEditor] = useReducer(
    cropEditorReducer,
    INITIAL_CROP_EDITOR,
  );

  const selectedRecord =
    records.find((record) => record.id === selectedRecordId) ?? null;
  const selectedCrop = selectedRecord?.crop
    ? clampCrop(selectedRecord.dimensions, selectedRecord.crop)
    : null;

  function handleCropComplete(_croppedArea: Area, croppedAreaPixels: Area) {
    if (!selectedRecord) return;
    const crop: CropSquare = {
      x: croppedAreaPixels.x,
      y: croppedAreaPixels.y,
      size: croppedAreaPixels.width,
      rotation: cropEditor.rotation,
    };
    setRecords((current) =>
      current.map((record) =>
        record.id === selectedRecord.id
          ? {
              ...record,
              crop: clampCrop(record.dimensions, crop),
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
    dispatchCropEditor({ type: "RECORD_SELECTED" });
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
                      image={selectedRecord.sourceUrl}
                      crop={cropEditor.crop}
                      zoom={cropEditor.zoom}
                      rotation={cropEditor.rotation}
                      aspect={1}
                      onCropChange={(crop) =>
                        dispatchCropEditor({ type: "CROP_CHANGE", crop })
                      }
                      onZoomChange={(zoom) =>
                        dispatchCropEditor({ type: "ZOOM_CHANGE", zoom })
                      }
                      onRotationChange={(rotation) =>
                        dispatchCropEditor({ type: "ROTATION_CHANGE", rotation })
                      }
                      onCropComplete={handleCropComplete}
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
