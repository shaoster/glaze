import { useReducer, useMemo } from "react";
import { Alert, Box, Button, CircularProgress } from "@mui/material";
import { Cloudinary } from "@cloudinary/url-gen";
import { format } from "@cloudinary/url-gen/actions/delivery";
import { auto as autoFormat } from "@cloudinary/url-gen/qualifiers/format";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import type { ImageCrop } from "../util/types";

interface CropOverlayProps {
  cloudinaryPublicId: string;
  cloudName: string;
  initialCrop: ImageCrop | null;
  onSave: (crop: ImageCrop) => Promise<void>;
  onCancel: () => void;
}

function buildUncroppedUrl(publicId: string, cloudName: string): string {
  const cld = new Cloudinary({ cloud: { cloudName } });
  const img = cld.image(publicId);
  img.delivery(format(autoFormat()));
  return img.toURL();
}

const DEFAULT_IMAGE_CROP: ImageCrop = { x: 0, y: 0, width: 1, height: 1 };

function toImageCrop(area: Area): ImageCrop {
  return {
    x: area.x / 100,
    y: area.y / 100,
    width: area.width / 100,
    height: area.height / 100,
  };
}

type State = {
  imageLoading: boolean;
  crop: { x: number; y: number };
  zoom: number;
  committedCrop: ImageCrop;
  saving: boolean;
  saveError: string | null;
};

type Action =
  | { type: "IMAGE_LOADED" }
  | { type: "CROP_CHANGE"; crop: { x: number; y: number } }
  | { type: "ZOOM_CHANGE"; zoom: number }
  | { type: "CROP_COMPLETE"; area: Area }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS" }
  | { type: "SAVE_ERROR"; error: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "IMAGE_LOADED":
      return { ...state, imageLoading: false };
    case "CROP_CHANGE":
      return { ...state, crop: action.crop };
    case "ZOOM_CHANGE":
      return { ...state, zoom: action.zoom };
    case "CROP_COMPLETE":
      return { ...state, committedCrop: toImageCrop(action.area) };
    case "SAVE_START":
      return { ...state, saving: true, saveError: null };
    case "SAVE_SUCCESS":
      return { ...state, saving: false };
    case "SAVE_ERROR":
      return { ...state, saving: false, saveError: action.error };
  }
}

export default function CropOverlay({
  cloudinaryPublicId,
  cloudName,
  initialCrop,
  onSave,
  onCancel,
}: CropOverlayProps) {
  const [state, dispatch] = useReducer(reducer, {
    imageLoading: true,
    crop: { x: 0, y: 0 },
    zoom: 1,
    committedCrop: initialCrop ?? DEFAULT_IMAGE_CROP,
    saving: false,
    saveError: null,
  });

  const url = useMemo(
    () => buildUncroppedUrl(cloudinaryPublicId, cloudName),
    [cloudinaryPublicId, cloudName],
  );

  async function handleSave() {
    dispatch({ type: "SAVE_START" });
    try {
      await onSave(state.committedCrop);
      dispatch({ type: "SAVE_SUCCESS" });
    } catch (e) {
      dispatch({
        type: "SAVE_ERROR",
        error: e instanceof Error ? e.message : "Save failed",
      });
    }
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
      }}
    >
      <Box
        sx={{
          position: "relative",
          width: "90vw",
          maxWidth: 800,
          height: "70vh",
        }}
      >
        {state.imageLoading && (
          <Box
            sx={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircularProgress sx={{ color: "white" }} />
          </Box>
        )}
        <Cropper
          image={url}
          crop={state.crop}
          zoom={state.zoom}
          initialCroppedAreaPercentages={
            initialCrop
              ? {
                  x: initialCrop.x * 100,
                  y: initialCrop.y * 100,
                  width: initialCrop.width * 100,
                  height: initialCrop.height * 100,
                }
              : undefined
          }
          onCropChange={(crop) => dispatch({ type: "CROP_CHANGE", crop })}
          onZoomChange={(zoom) => dispatch({ type: "ZOOM_CHANGE", zoom })}
          onCropComplete={(croppedArea) =>
            dispatch({ type: "CROP_COMPLETE", area: croppedArea })
          }
          onMediaLoaded={() => dispatch({ type: "IMAGE_LOADED" })}
        />
      </Box>
      {state.saveError && (
        <Alert severity="error" sx={{ maxWidth: "90vw", position: "relative", zIndex: 2 }}>
          {state.saveError}
        </Alert>
      )}
      <Box sx={{ display: "flex", gap: 1, mt: 1, position: "relative", zIndex: 2 }}>
        <Button
          variant="outlined"
          onClick={onCancel}
          disabled={state.saving}
          sx={{ color: "white", borderColor: "rgba(255,255,255,0.5)" }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleSave()}
          disabled={state.saving || state.imageLoading}
        >
          {state.saving ? <CircularProgress size={18} /> : "Save Crop"}
        </Button>
      </Box>
    </Box>
  );
}
