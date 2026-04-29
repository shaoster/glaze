import type { ReactNode } from "react";
import { Button, Chip, List, ListItemButton, ListItemText, Stack } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { UploadedRecord } from "./glazeImportToolTypes";

interface GlazeImportRecordListProps {
  records: UploadedRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  showReviewed?: boolean;
  hideCropChip?: boolean;
  getSecondaryText?: (record: UploadedRecord) => string | undefined;
  renderAction?: (record: UploadedRecord) => ReactNode;
}

export default function GlazeImportRecordList({
  records,
  selectedId,
  onSelect,
  onDelete,
  showReviewed,
  hideCropChip,
  getSecondaryText,
  renderAction,
}: GlazeImportRecordListProps) {
  return (
    <List
      sx={{
        border: (theme) => `1px solid ${theme.palette.divider}`,
        borderRadius: 3,
        overflow: "auto",
      }}
    >
      {records.map((record) => (
        <ListItemButton
          key={record.id}
          selected={record.id === selectedId}
          onClick={() => onSelect(record.id)}
          sx={{ alignItems: "center", gap: 1 }}
        >
          <ListItemText
            primary={record.parsedFields.name || record.filename}
            secondary={getSecondaryText?.(record)}
            slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
          />
          <Stack direction="row" spacing={0.5} flexShrink={0} alignItems="center">
            {!hideCropChip ? (
              <Chip
                label={record.cropped ? "cropped" : "uncropped"}
                color={record.cropped ? "success" : "error"}
                size="small"
              />
            ) : null}
            {record.ocrStatus !== "idle" ? (
              <Chip
                label={record.ocrStatus === "done" ? "ocr ready" : record.ocrStatus}
                color={
                  record.ocrStatus === "done"
                    ? "success"
                    : record.ocrStatus === "error"
                      ? "error"
                      : "default"
                }
                size="small"
              />
            ) : null}
            {showReviewed ? (
              <Chip
                label={record.reviewed ? "reviewed" : "unreviewed"}
                color={record.reviewed ? "success" : "default"}
                size="small"
              />
            ) : null}
            {renderAction ? (
              <Stack
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {renderAction(record)}
              </Stack>
            ) : null}
          </Stack>
          <Button
            color="error"
            size="small"
            aria-label={`Delete ${record.parsedFields.name || record.filename}`}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(record.id);
            }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </Button>
        </ListItemButton>
      ))}
    </List>
  );
}
