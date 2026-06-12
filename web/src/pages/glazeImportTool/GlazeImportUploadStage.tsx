import type { RefObject } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";
import GlazeImportProgressList from "./GlazeImportProgressList";
import GlazeImportRecordList from "./GlazeImportRecordList";
import type {
  UploadedRecord,
  UploadProgressEntry,
} from "./glazeImportToolTypes";

interface GlazeImportUploadStageProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  remoteFileInputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;
  remoteUploading: boolean;
  remoteError: string | null;
  uploadProgress: UploadProgressEntry[];
  records: UploadedRecord[];
  selectedRecordId: string | null;
  onFileSelection: (files: FileList | null) => void;
  onRemoteFileSelection: (files: FileList | null) => void;
  onContinueToCrop: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const UPLOAD_STATUS_LABELS: Record<UploadProgressEntry["status"], string> = {
  queued: "Queued",
  processing: "Reading metadata…",
  uploading: "Uploading to cloud storage…",
  ready: "Ready",
  error: "Error",
};

export default function GlazeImportUploadStage({
  fileInputRef,
  remoteFileInputRef,
  uploading,
  remoteUploading,
  remoteError,
  uploadProgress,
  records,
  selectedRecordId,
  onFileSelection,
  onRemoteFileSelection,
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
        Browser-side upload works best for JPG and PNG. `Upload Via Cloud`
        stores the source in cloud storage first, then loads it back into the
        crop tool.
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
      <input
        ref={remoteFileInputRef}
        data-testid="remote-upload-input"
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(event) => {
          onRemoteFileSelection(event.target.files);
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
          onClick={() => remoteFileInputRef.current?.click()}
          disabled={remoteUploading}
        >
          {remoteUploading ? "Uploading…" : "Upload Via Cloud"}
        </Button>
        {records.length > 0 ? (
          <Button variant="outlined" onClick={onContinueToCrop}>
            Continue To Crop
          </Button>
        ) : null}
      </Stack>
      {remoteError ? <Alert severity="error">{remoteError}</Alert> : null}
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
