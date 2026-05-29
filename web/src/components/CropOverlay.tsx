import { useReducer, useMemo } from "react";
import { Alert, Box, Button, CircularProgress } from "@mui/material";
import { Cloudinary } from "@cloudinary/url-gen";
import { format } from "@cloudinary/url-gen/actions/delivery";
import { auto as autoFormat } from "@cloudinary/url-gen/qualifiers/format";
import { Cropper, RectangleStencil, ImageRestriction } from "react-advanced-cropper";
import type { CropperRef } from "react-advanced-cropper";
import "react-advanced-cropper/dist/style.css";
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

/**
 * Convert a react-advanced-cropper coordinate (image pixels) into the
 * fraction-based ImageCrop the backend stores. Free-form crops yield
 * independent width/height fractions.
 */
function toImageCrop(
  coords: { left: number; top: number; width: number; height: number },
  imageSize: { width: number; height: number },
): ImageCrop {
  return {
    x: coords.left / imageSize.width,
    y: coords.top / imageSize.height,
    width: coords.width / imageSize.width,
    height: coords.height / imageSize.height,
  };
}

type State = {
  imageLoading: boolean;
  committedCrop: ImageCrop;
  saving: boolean;
  saveError: string | null;
};

type Action =
  | { type: "IMAGE_LOADED" }
  | { type: "CROP_COMPLETE"; crop: ImageCrop }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS" }
  | { type: "SAVE_ERROR"; error: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "IMAGE_LOADED":
      return { ...state, imageLoading: false };
    case "CROP_COMPLETE":
      return { ...state, committedCrop: action.crop };
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
    committedCrop: initialCrop ?? DEFAULT_IMAGE_CROP,
    saving: false,
    saveError: null,
  });

  const url = useMemo(
    () => buildUncroppedUrl(cloudinaryPublicId, cloudName),
    [cloudinaryPublicId, cloudName],
  );

  function handleChange(cropper: CropperRef) {
    const coords = cropper.getCoordinates();
    const imageSize = cropper.getState()?.imageSize;
    if (!coords || !imageSize || !imageSize.width || !imageSize.height) return;
    dispatch({ type: "CROP_COMPLETE", crop: toImageCrop(coords, imageSize) });
  }

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
          src={url}
          stencilComponent={RectangleStencil}
          // No aspectRatio → free-form, resizable in any direction (#737).
          stencilProps={{ grid: true }}
          imageRestriction={ImageRestriction.fitArea}
          style={{ width: "100%", height: "100%" }}
          defaultSize={({ imageSize }: { imageSize: { width: number; height: number } }) =>
            initialCrop
              ? {
                  width: initialCrop.width * imageSize.width,
                  height: initialCrop.height * imageSize.height,
                }
              : { width: imageSize.width, height: imageSize.height }
          }
          defaultPosition={({ imageSize }: { imageSize: { width: number; height: number } }) =>
            initialCrop
              ? {
                  left: initialCrop.x * imageSize.width,
                  top: initialCrop.y * imageSize.height,
                }
              : { left: 0, top: 0 }
          }
          onChange={handleChange}
          onReady={(cropper: CropperRef) => {
            handleChange(cropper);
            dispatch({ type: "IMAGE_LOADED" });
          }}
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
