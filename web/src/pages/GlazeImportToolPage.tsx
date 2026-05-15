import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CropFreeIcon from "@mui/icons-material/CropFree";
import TextSnippetIcon from "@mui/icons-material/TextSnippet";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import MergeIcon from "@mui/icons-material/MergeType";
import {
  extractErrorMessage,
  importManualSquareCropRecords,
  type CloudinaryWidgetConfig,
  type ManualSquareCropImportResponse,
} from "../util/api";
import { openCloudinaryUploadWidget } from "../util/cloudinaryUpload";
import GlazeImportCropStage from "./glazeImportTool/GlazeImportCropStage";
import GlazeImportImportStage from "./glazeImportTool/GlazeImportImportStage";
import GlazeImportOcrStage from "./glazeImportTool/GlazeImportOcrStage";
import GlazeImportReconcileStage from "./glazeImportTool/GlazeImportReconcileStage";
import GlazeImportReviewStage from "./glazeImportTool/GlazeImportReviewStage";
import GlazeImportUploadStage from "./glazeImportTool/GlazeImportUploadStage";
import {
  DEFAULT_OCR_TUNING,
  DEFAULT_PARSED_FIELDS,
} from "./glazeImportTool/glazeImportToolOcr";
import {
  buildCropFile,
  detectOcrRegion,
  loadImageElement,
} from "./glazeImportTool/glazeImportToolProcessing";
import {
  clampCrop,
  defaultCrop,
} from "./glazeImportTool/glazeImportToolGeometry";
import type {
  UploadedRecord,
  UploadProgressEntry,
} from "./glazeImportTool/glazeImportToolTypes";

const TAB_UPLOAD = 0;
const TAB_CROP = 1;
const TAB_OCR = 2;
const TAB_REVIEW = 3;
const TAB_IMPORT = 4;
const TAB_RECONCILE = 5;

function createRecordId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `rec-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function buildCloudinaryJpgUrl(
  config: CloudinaryWidgetConfig,
  publicId: string,
) {
  return `https://res.cloudinary.com/${config.cloud_name}/image/upload/f_jpg/${publicId}.jpg`;
}
export default function GlazeImportToolPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recordsRef = useRef<UploadedRecord[]>([]);

  const [activeTab, setActiveTab] = useState(TAB_UPLOAD);
  const [records, setRecords] = useState<UploadedRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [cropPreviewUrl, setCropPreviewUrl] = useState<string | null>(null);
  const [cropPreviewLoading, setCropPreviewLoading] = useState(false);
  // Debounced snapshot of the record used to generate the crop preview.
  // Only updated after 200ms of no crop changes so dragging stays snappy.
  const [previewRecord, setPreviewRecord] = useState<UploadedRecord | null>(
    null,
  );
  const [importRunning, setImportRunning] = useState(false);
  const [importResult, setImportResult] =
    useState<ManualSquareCropImportResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressEntry[]>(
    [],
  );
  const [uploading, setUploading] = useState(false);
  const [widgetUploading, setWidgetUploading] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [importBuildProgress, setImportBuildProgress] = useState<
    UploadProgressEntry[]
  >([]);
  const [reconciledIds, setReconciledIds] = useState<Set<string>>(new Set());

  const selectedRecord =
    records.find((record) => record.id === selectedRecordId) ?? null;
  const allCropped =
    records.length > 0 && records.every((record) => record.crop);
  const allReviewed =
    records.length > 0 && records.every((record) => record.reviewed);
  const duplicateResults =
    importResult?.results.filter((r) => r.status === "skipped_duplicate") ?? [];
  const hasDuplicates = duplicateResults.length > 0;

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    if (!window.cloudinary?.createUploadWidget) return;
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-cloudinary-widget="true"]',
    );
    if (existing) return;
    const script = document.createElement("script");
    script.src = "https://upload-widget.cloudinary.com/global/all.js";
    script.async = true;
    script.dataset.cloudinaryWidget = "true";
    document.body.appendChild(script);
  }, []);

  // Stable string key that only changes when the crop geometry changes.
  // Adjusting the OCR region leaves this key unchanged, so the preview is
  // not re-rendered (or even re-debounced) when only ocrRegion moves.
  const cropKey = selectedRecord
    ? `${selectedRecord.id}:${selectedRecord.crop ? `${selectedRecord.crop.x},${selectedRecord.crop.y},${selectedRecord.crop.size},${selectedRecord.crop.rotation}` : ""}`
    : "";
  const selectedRecordRef = useRef(selectedRecord);
  selectedRecordRef.current = selectedRecord;

  // Show the spinner immediately when the crop changes, then debounce the
  // actual preview render so rapid drag moves don't queue up buildCropFile calls.
  useEffect(() => {
    if (!selectedRecordRef.current?.crop) {
      setCropPreviewLoading(false);
      setPreviewRecord(selectedRecordRef.current);
      return;
    }
    setCropPreviewLoading(true);
    const timer = setTimeout(
      () => setPreviewRecord(selectedRecordRef.current),
      200,
    );
    return () => clearTimeout(timer);
    // cropKey is intentionally used as the sole dependency: only the crop
    // geometry (not ocrRegion or other fields) should trigger a preview rebuild.
  }, [cropKey]);

  useEffect(() => {
    let revokedUrl: string | null = null;
    async function refreshPreview() {
      if (!previewRecord || !previewRecord.crop) {
        setCropPreviewUrl(null);
        setCropPreviewLoading(false);
        return;
      }
      try {
        const file = await buildCropFile(previewRecord);
        const objectUrl = URL.createObjectURL(file);
        revokedUrl = objectUrl;
        setCropPreviewUrl(objectUrl);
      } catch {
        setCropPreviewUrl(null);
      } finally {
        setCropPreviewLoading(false);
      }
    }
    void refreshPreview();
    return () => {
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [previewRecord]);

  useEffect(
    () => () => {
      for (const record of recordsRef.current) {
        if (record.sourceKind === "local") {
          URL.revokeObjectURL(record.sourceUrl);
        }
      }
    },
    [],
  );

  async function handleFileSelection(fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    setUploading(true);
    setUploadProgress(
      files.map((file) => ({
        id: createRecordId(),
        filename: file.name,
        status: "queued",
        progress: 5,
        error: null,
      })),
    );
    const nextRecords: UploadedRecord[] = [];
    for (const [index, file] of files.entries()) {
      setUploadProgress((current) =>
        current.map((entry, entryIndex) =>
          entryIndex === index
            ? { ...entry, status: "processing", progress: 35, error: null }
            : entry,
        ),
      );
      const objectUrl = URL.createObjectURL(file);
      try {
        const image = await loadImageElement(objectUrl);
        nextRecords.push({
          id: createRecordId(),
          file,
          sourceUrl: objectUrl,
          filename: file.name,
          dimensions: {
            width: image.naturalWidth,
            height: image.naturalHeight,
          },
          crop: clampCrop(
            { width: image.naturalWidth, height: image.naturalHeight },
            defaultCrop({
              width: image.naturalWidth,
              height: image.naturalHeight,
            }),
          ),
          cropped: false,
          ...(await detectOcrRegion(
            image,
            clampCrop(
              { width: image.naturalWidth, height: image.naturalHeight },
              defaultCrop({
                width: image.naturalWidth,
                height: image.naturalHeight,
              }),
            ),
            DEFAULT_OCR_TUNING.labelWhiteThreshold,
            DEFAULT_OCR_TUNING.textDarkThreshold,
          )),
          ocrTuning: { ...DEFAULT_OCR_TUNING },
          parsedFields: { ...DEFAULT_PARSED_FIELDS },
          ocrSuggestion: null,
          reviewed: false,
          ocrStatus: "idle",
          ocrError: null,
          sourceKind: "local",
          cloudinaryPublicId: null,
        });
        setUploadProgress((current) =>
          current.map((entry, entryIndex) =>
            entryIndex === index
              ? { ...entry, status: "ready", progress: 100, error: null }
              : entry,
          ),
        );
      } catch {
        URL.revokeObjectURL(objectUrl);
        setUploadProgress((current) =>
          current.map((entry, entryIndex) =>
            entryIndex === index
              ? {
                  ...entry,
                  status: "error",
                  progress: 100,
                  error: "This file could not be decoded in the browser.",
                }
              : entry,
          ),
        );
      }
    }
    setUploading(false);
    if (!nextRecords.length) return;
    setRecords((current) => [...current, ...nextRecords]);
    setSelectedRecordId(null);
    setImportResult(null);
    setActiveTab(TAB_CROP);
  }

  async function startCloudinaryUpload() {
    setWidgetError(null);
    setWidgetUploading(true);
    const widget = await openCloudinaryUploadWidget({
      messages: {
        configError: "Failed to load Cloudinary upload configuration.",
        unavailableError:
          "Cloudinary upload widget is not available in this browser.",
        signatureError: "Failed to sign Cloudinary upload.",
        uploadError: "Cloudinary upload failed.",
      },
      widgetOptions: {
        sources: ["local"],
        multiple: true,
        resourceType: "image",
      },
      callbacks: {
        onError: (message) => {
          setWidgetUploading(false);
          setWidgetError(message);
        },
        onDisplayChange: (state) => {
          if (state === "shown") {
            setWidgetUploading(false);
          }
        },
        onSuccess: async (result, config) => {
          const publicId = String(result.info.public_id || "");
          const originalFilename = String(
            result.info.original_filename || publicId || "upload",
          );
          const format = String(result.info.format || "");
          const filename = format
            ? `${originalFilename}.${format}`
            : originalFilename;
          const progressId = createRecordId();
          setUploadProgress((current) => [
            {
              id: progressId,
              filename,
              status: "uploading",
              progress: 70,
              error: null,
            },
            ...current,
          ]);
          try {
            const jpgUrl = buildCloudinaryJpgUrl(config, publicId);
            const image = await loadImageElement(jpgUrl);
            const cloudinaryDimensions = {
              width: image.naturalWidth,
              height: image.naturalHeight,
            };
            const cloudinaryCrop = clampCrop(
              cloudinaryDimensions,
              defaultCrop(cloudinaryDimensions),
            );
            const record: UploadedRecord = {
              id: createRecordId(),
              file: null,
              sourceUrl: jpgUrl,
              filename,
              dimensions: cloudinaryDimensions,
              crop: cloudinaryCrop,
              cropped: false,
              ...(await detectOcrRegion(
                image,
                cloudinaryCrop,
                DEFAULT_OCR_TUNING.labelWhiteThreshold,
                DEFAULT_OCR_TUNING.textDarkThreshold,
              )),
              ocrTuning: { ...DEFAULT_OCR_TUNING },
              parsedFields: { ...DEFAULT_PARSED_FIELDS },
              ocrSuggestion: null,
              reviewed: false,
              ocrStatus: "idle",
              ocrError: null,
              sourceKind: "cloudinary",
              cloudinaryPublicId: publicId,
            };
            setRecords((current) => [record, ...current]);
            setSelectedRecordId(null);
            setUploadProgress((current) =>
              current.map((entry) =>
                entry.id === progressId
                  ? { ...entry, status: "ready", progress: 100, error: null }
                  : entry,
              ),
            );
            setImportResult(null);
            setActiveTab(TAB_CROP);
          } catch {
            setUploadProgress((current) =>
              current.map((entry) =>
                entry.id === progressId
                  ? {
                      ...entry,
                      status: "error",
                      progress: 100,
                      error:
                        "Cloudinary upload succeeded, but the converted JPG could not be loaded.",
                    }
                  : entry,
              ),
            );
          }
        },
      },
    });
    if (!widget) {
      setWidgetUploading(false);
    }
  }

  function confirmDeleteRecord(id: string) {
    setDeleteConfirmId(id);
  }

  function executeDeleteRecord() {
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    if (!id) return;
    const record = records.find((item) => item.id === id);
    if (!record) return;
    if (record.sourceKind === "local") {
      URL.revokeObjectURL(record.sourceUrl);
    }
    const remaining = records.filter((item) => item.id !== id);
    setRecords(remaining);
    setSelectedRecordId((current) => {
      if (current !== id) return current;
      return remaining[0]?.id ?? null;
    });
  }

  async function runImport() {
    if (!allReviewed) return;
    setImportRunning(true);
    setImportError(null);
    setImportResult(null);
    setReconciledIds(new Set());
    setImportBuildProgress(
      records.map((record) => ({
        id: record.id,
        filename: record.parsedFields.name || record.filename,
        status: "queued",
        progress: 0,
        error: null,
      })),
    );
    try {
      const cropFiles: Record<string, File> = {};
      for (const record of records) {
        setImportBuildProgress((current) =>
          current.map((entry) =>
            entry.id === record.id
              ? { ...entry, status: "processing", progress: 40 }
              : entry,
          ),
        );
        cropFiles[record.id] = await buildCropFile(record);
        setImportBuildProgress((current) =>
          current.map((entry) =>
            entry.id === record.id
              ? { ...entry, status: "uploading", progress: 80 }
              : entry,
          ),
        );
      }
      const result = await importManualSquareCropRecords(
        records.map((record) => ({
          client_id: record.id,
          filename: record.filename,
          reviewed: record.reviewed,
          parsed_fields: record.parsedFields,
        })),
        cropFiles,
      );
      setImportBuildProgress((current) =>
        current.map((entry) => ({ ...entry, status: "ready", progress: 100 })),
      );
      setImportResult(result);
      setActiveTab(TAB_IMPORT);
    } catch (error) {
      setImportError(extractErrorMessage(error, "Import failed."));
      setImportBuildProgress((current) =>
        current.map((entry) =>
          entry.status !== "ready"
            ? { ...entry, status: "error", progress: 100 }
            : entry,
        ),
      );
    } finally {
      setImportRunning(false);
    }
  }

  const deleteConfirmRecord =
    records.find((r) => r.id === deleteConfirmId) ?? null;

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4" component="h1">
          Glaze Import Tool
        </Typography>
        <Typography color="text.secondary">
          Bulk upload source images, crop each record into a transparency-safe
          square, run OCR on the cropped result, review the parsed fields, then
          import new public glaze records while skipping duplicates.
        </Typography>
      </Stack>

      <Tabs
        value={activeTab}
        onChange={(_event, nextValue) => {
          if (
            nextValue === TAB_CROP ||
            nextValue === TAB_OCR ||
            nextValue === TAB_REVIEW
          ) {
            setSelectedRecordId(null);
          }
          setActiveTab(nextValue);
        }}
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab
          icon={<UploadFileIcon />}
          iconPosition="start"
          label="1. Upload"
          value={TAB_UPLOAD}
        />
        <Tab
          icon={<CropFreeIcon />}
          iconPosition="start"
          label="2. Crop"
          value={TAB_CROP}
          disabled={records.length === 0}
        />
        <Tab
          icon={<TextSnippetIcon />}
          iconPosition="start"
          label="3. OCR"
          value={TAB_OCR}
          disabled={!allCropped}
        />
        <Tab
          icon={<FactCheckIcon />}
          iconPosition="start"
          label="4. Review"
          value={TAB_REVIEW}
          disabled={records.length === 0}
        />
        <Tab
          icon={<CloudUploadIcon />}
          iconPosition="start"
          label="5. Import"
          value={TAB_IMPORT}
          disabled={!allReviewed && !importResult}
        />
        {hasDuplicates ? (
          <Tab
            icon={<MergeIcon />}
            iconPosition="start"
            label="6. Reconcile"
            value={TAB_RECONCILE}
          />
        ) : null}
      </Tabs>

      {activeTab === TAB_UPLOAD ? (
        <GlazeImportUploadStage
          fileInputRef={fileInputRef}
          uploading={uploading}
          widgetUploading={widgetUploading}
          widgetError={widgetError}
          uploadProgress={uploadProgress}
          records={records}
          selectedRecordId={selectedRecordId}
          onFileSelection={(files) => {
            void handleFileSelection(files);
          }}
          onStartCloudinaryUpload={() => {
            void startCloudinaryUpload();
          }}
          onContinueToCrop={() => setActiveTab(TAB_CROP)}
          onSelect={setSelectedRecordId}
          onDelete={confirmDeleteRecord}
        />
      ) : null}

      {activeTab === TAB_CROP ? (
        <GlazeImportCropStage
          records={records}
          selectedRecordId={selectedRecordId}
          allCropped={allCropped}
          cropPreviewLoading={cropPreviewLoading}
          cropPreviewUrl={cropPreviewUrl}
          setRecords={setRecords}
          setSelectedRecordId={setSelectedRecordId}
          onDelete={confirmDeleteRecord}
          onContinueToOcr={() => setActiveTab(TAB_OCR)}
        />
      ) : null}

      {activeTab === TAB_OCR ? (
        <GlazeImportOcrStage
          records={records}
          selectedRecordId={selectedRecordId}
          cropPreviewLoading={cropPreviewLoading}
          cropPreviewUrl={cropPreviewUrl}
          setRecords={setRecords}
          setSelectedRecordId={setSelectedRecordId}
          onDelete={confirmDeleteRecord}
          onClearImportResult={() => setImportResult(null)}
          onContinueToReview={() => setActiveTab(TAB_REVIEW)}
        />
      ) : null}

      {activeTab === TAB_REVIEW ? (
        <GlazeImportReviewStage
          records={records}
          selectedRecordId={selectedRecordId}
          cropPreviewLoading={cropPreviewLoading}
          cropPreviewUrl={cropPreviewUrl}
          allReviewed={allReviewed}
          setRecords={setRecords}
          setSelectedRecordId={setSelectedRecordId}
          onDelete={confirmDeleteRecord}
          onContinueToImport={() => setActiveTab(TAB_IMPORT)}
        />
      ) : null}

      {activeTab === TAB_IMPORT ? (
        <GlazeImportImportStage
          allReviewed={allReviewed}
          importRunning={importRunning}
          importError={importError}
          importBuildProgress={importBuildProgress}
          importResult={importResult}
          hasDuplicates={hasDuplicates}
          onRunImport={() => {
            void runImport();
          }}
          onGoToReconcile={() => setActiveTab(TAB_RECONCILE)}
        />
      ) : null}

      {activeTab === TAB_RECONCILE ? (
        <GlazeImportReconcileStage
          duplicateResults={duplicateResults}
          records={records}
          reconciledIds={reconciledIds}
          onToggleResolved={(clientId, checked) =>
            setReconciledIds((current) => {
              const next = new Set(current);
              if (checked) next.add(clientId);
              else next.delete(clientId);
              return next;
            })
          }
        />
      ) : null}

      <Dialog
        open={deleteConfirmId != null}
        onClose={() => setDeleteConfirmId(null)}
      >
        <DialogTitle>Delete record?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteConfirmRecord?.filename} will be removed from this session.
            This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={executeDeleteRecord}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
