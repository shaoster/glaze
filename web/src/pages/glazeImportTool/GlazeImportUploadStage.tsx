import type { RefObject } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";
import GlazeImportProgressList from "./GlazeImportProgressList";
import GlazeImportRecordList from "./GlazeImportRecordList";
import type { UploadedRecord, UploadProgressEntry } from "./glazeImportToolTypes";

interface GlazeImportUploadStageProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;
  widgetUploading: boolean;
  widgetError: string | null;
  uploadProgress: UploadProgressEntry[];
  records: UploadedRecord[];
  selectedRecordId: string | null;
  onFileSelection: (files: FileList | null) => void;
  onStartCloudinaryUpload: () => void;
  onContinueToCrop: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const UPLOAD_STATUS_LABELS: Record<UploadProgressEntry["status"], string> = {
  queued: "Queued",
  processing: "Reading metadata…",
  uploading: "Converting via Cloudinary…",
  ready: "Ready",
  error: "Error",
};

export default function GlazeImportUploadStage({
  fileInputRef,
  uploading,
  widgetUploading,
  widgetError,
  uploadProgress,
  records,
  selectedRecordId,
  onFileSelection,
  onStartCloudinaryUpload,
  onContinueToCrop,
  onSelect,
  onDelete,
}: GlazeImportUploadStageProps) {
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Start by bulk uploading the source images. Each uploaded image becomes
        its own record and starts uncropped.
      </Alert>
      <Alert severity="warning">
        Browser-side upload works best for JPG and PNG. For `.heic` and
        `.heif`, use `Upload Via Cloudinary` so Cloudinary can convert the
        source before the crop tool loads it.
      </Alert>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(event) => {
          onFileSelection(event.target.files);
          event.target.value = "";
        }}
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Button
          variant="contained"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Processing Images…" : "Bulk Upload Images"}
        </Button>
        <Button
          variant="outlined"
          onClick={onStartCloudinaryUpload}
          disabled={widgetUploading}
        >
          {widgetUploading ? "Opening Cloudinary…" : "Upload Via Cloudinary"}
        </Button>
        {records.length > 0 ? (
          <Button variant="outlined" onClick={onContinueToCrop}>
            Continue To Crop
          </Button>
        ) : null}
      </Stack>
      {widgetError ? <Alert severity="error">{widgetError}</Alert> : null}
      <GlazeImportProgressList
        title="Upload Progress"
        entries={uploadProgress}
        statusLabels={UPLOAD_STATUS_LABELS}
      />
      {records.length > 0 ? (
        <>
          <Typography variant="subtitle1">Uploaded Records</Typography>
          <GlazeImportRecordList
            records={records}
            selectedId={selectedRecordId}
            onSelect={onSelect}
            onDelete={onDelete}
            showReviewed
          />
        </>
      ) : (
        <Typography color="text.secondary">No records uploaded yet.</Typography>
      )}
    </Stack>
  );
}
