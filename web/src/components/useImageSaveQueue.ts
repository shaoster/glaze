import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@mui/material";
import type { Dispatch } from "react";
import type { PieceDetail } from "../util/types";
import { updateCurrentState, type UpdateStatePayload } from "../util/api";
import { openCloudinaryUploadWidget } from "../util/cloudinaryUpload";
import type { DraftAction, ImageEntry } from "./workflowStateDraft";

type UseImageSaveQueueOptions = {
  pieceId: string;
  initialStateId: string;
  saveStateFn?: (payload: UpdateStatePayload) => Promise<PieceDetail>;
  notes: string;
  normalizedCustomFields: Record<string, string | number | boolean | null>;
  images: ImageEntry[];
  onSaved: (updated: PieceDetail) => void;
  dispatch: Dispatch<DraftAction>;
  readOnly: boolean;
};

/**
 * Manages Cloudinary upload widget state and the sequential image-save queue.
 *
 * Uploads are persisted one at a time via a chained Promise queue so that rapid
 * uploads don't race and overwrite each other's image arrays. The hook also owns
 * the widget open/close lifecycle, iOS safe-area styles, and all upload-related
 * error state so WorkflowState only handles field editing.
 */
export function useImageSaveQueue({
  pieceId,
  initialStateId,
  saveStateFn,
  notes,
  normalizedCustomFields,
  images,
  onSaved,
  dispatch,
  readOnly,
}: UseImageSaveQueueOptions) {
  const theme = useTheme();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const latestImagesRef = useRef<ImageEntry[]>(images);
  const imageSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    latestImagesRef.current = images;
  }, [images]);

  const saveUploadedImage = useCallback(
    (newImage: ImageEntry) => {
      setSavingImage(true);
      setImageError(null);
      const queuedSave = imageSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const nextImages = [...latestImagesRef.current, newImage];
          const payload = {
            notes,
            images: nextImages,
            custom_fields: normalizedCustomFields,
          };
          const saveFn = saveStateFn ?? ((p) => updateCurrentState(pieceId, p));
          const result = await saveFn(payload);
          const savedState = saveStateFn
            ? (result.history.find((ps) => ps.id === initialStateId) ??
              result.current_state)
            : result.current_state;
          latestImagesRef.current = savedState.images;
          dispatch({
            type: "replace_base_state",
            pieceState: savedState,
          });
          onSaved(result);
        });
      imageSaveQueueRef.current = queuedSave;
      queuedSave
        .catch(() => setImageError("Failed to save image. Please try again."))
        .finally(() => {
          if (imageSaveQueueRef.current === queuedSave) {
            setSavingImage(false);
          }
        });
    },
    [
      dispatch,
      initialStateId,
      normalizedCustomFields,
      notes,
      onSaved,
      pieceId,
      saveStateFn,
    ],
  );

  async function handleUploadWidgetClick() {
    if (readOnly) {
      return;
    }
    setUploadError(null);
    setWidgetLoading(true);
    // Keeps the iframe hidden until it is ready (removed on display-changed: shown).
    const hideStyle = document.createElement("style");
    hideStyle.textContent = 'iframe[title="Upload Widget"] { opacity: 0; }';
    document.head.appendChild(hideStyle);
    // On iOS PWA with viewport-fit=cover the status bar overlays the page.
    // Push the widget iframe below it so its header controls are reachable.
    // This style must persist for the widget's lifetime (not removed with hideStyle).
    const safeAreaStyle = document.createElement("style");
    safeAreaStyle.textContent =
      'iframe[title="Upload Widget"] { top: env(safe-area-inset-top) !important; height: calc(100dvh - env(safe-area-inset-top)) !important; }';
    document.head.appendChild(safeAreaStyle);

    const cleanupWidgetStyles = () => {
      hideStyle.remove();
      safeAreaStyle.remove();
    };
    const uploadWidget = await openCloudinaryUploadWidget({
      messages: {
        configError: "Failed to load upload configuration. Please try again.",
        unavailableError:
          "Upload widget is not available in this browser. Please try again.",
        signatureError: "Failed to sign upload. Please try again.",
        uploadError: "Upload failed. Please try again.",
      },
      widgetOptions: {
        sources: ["local", "camera"],
        multiple: true,
        resourceType: "image",
        styles: {
          palette: {
            window: theme.palette.background.paper,
            windowBorder: theme.palette.divider,
            tabIcon: theme.palette.primary.main,
            menuIcons: theme.palette.text.secondary,
            textDark: theme.palette.text.primary,
            textLight: theme.palette.text.secondary,
            link: theme.palette.primary.main,
            action: theme.palette.primary.dark,
            inactiveTabIcon: theme.palette.text.disabled,
            error: theme.palette.error.main,
            inProgress: theme.palette.primary.main,
            complete: theme.palette.success.main,
            sourceBg: theme.palette.background.default,
          },
          frame: { background: "#00000000" },
        } as { palette: Record<string, string> },
      },
      callbacks: {
        onError: (message) => {
          setWidgetLoading(false);
          cleanupWidgetStyles();
          setUploadError(message);
        },
        onDisplayChange: (state) => {
          if (state === "shown") {
            setWidgetLoading(false);
            hideStyle.remove();
            const iframe = document.querySelector(
              'iframe[title="Upload Widget"]',
            );
            if (iframe instanceof HTMLElement) {
              iframe.style.transition = "opacity 0.15s ease-in";
              iframe.style.opacity = "1";
            }
          } else if (state === "hidden" || state === "destroyed") {
            safeAreaStyle.remove();
          }
        },
        onSuccess: (result, config) => {
          const newImage = {
            url: result.info.secure_url,
            caption: "",
            cloudinary_public_id: result.info.public_id,
            cloud_name: config.cloud_name,
            crop: null,
            width: result.info.width ?? null,
            height: result.info.height ?? null,
          };
          saveUploadedImage(newImage);
        },
      },
    });
    if (!uploadWidget) {
      setWidgetLoading(false);
      cleanupWidgetStyles();
    }
  }

  return {
    uploadError,
    widgetLoading,
    savingImage,
    imageError,
    saveUploadedImage,
    handleUploadWidgetClick,
  };
}
