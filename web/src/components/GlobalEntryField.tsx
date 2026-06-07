import { useState } from "react";
import { Button, Chip, InputAdornment, TextField } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import GlobalEntryDialog from "./GlobalEntryDialog";
import type { GlobalFieldRouting } from "../routing/pieceRouting";

export interface GlobalEntryFieldProps {
  globalName: string;
  label: string;
  value: string;
  onSelect: (entry: { id: string; name: string } | null) => void;
  helperText?: string;
  required?: boolean;
  canCreate?: boolean;
  hideLabel?: boolean;
  disabled?: boolean;
  hideActionWhenDisabled?: boolean;
  sx?: SxProps<Theme>;
  // Injected by RoutedGlobalEntryField when inside a /pieces/:id context.
  // Absent when used in unrouted contexts (e.g. NewPieceDialog).
  routing?: GlobalFieldRouting;
}

export default function GlobalEntryField({
  globalName,
  label,
  value,
  onSelect,
  helperText,
  required = false,
  canCreate = false,
  disabled = false,
  hideActionWhenDisabled = false,
  sx,
  routing,
}: GlobalEntryFieldProps) {
  const [localOpen, setLocalOpen] = useState(false);
  // Disabled fields never open the picker, even when the URL targets this field.
  const open = !disabled && (routing?.open ?? localOpen);
  const onOpen = routing?.onOpen ?? (() => setLocalOpen(true));
  const onClose = routing?.onClose ?? (() => setLocalOpen(false));
  const showAction = !disabled || !hideActionWhenDisabled;

  return (
    <>
      <TextField
        label={label}
        value={value ? "" : "None selected"}
        helperText={helperText}
        required={required}
        disabled={disabled}
        fullWidth
        slotProps={{
          input: {
            readOnly: true,
            startAdornment: value ? (
              <InputAdornment position="start">
                <Chip
                  label={value}
                  size="small"
                  onDelete={disabled ? undefined : () => onSelect(null)}
                />
              </InputAdornment>
            ) : null,
            endAdornment: showAction ? (
              <InputAdornment position="end">
                <Button
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen();
                  }}
                  disabled={disabled}
                  aria-label={value ? `Change ${label}` : `Browse ${label}`}
                >
                  {value ? "Change" : "Browse"}
                </Button>
              </InputAdornment>
            ) : null,
          },
        }}
        sx={[
          {
            "& .MuiInputBase-root": {
              cursor: "pointer",
              // If there's a value, the actual input text is hidden
              "& input": {
                display: value ? "none" : "block",
              },
            },
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
        onClick={disabled ? undefined : onOpen}
      />
      <GlobalEntryDialog
        globalName={globalName}
        open={open}
        tab={routing?.tab}
        onTabChange={routing?.onTabChange}
        onClose={onClose}
        onSelect={onSelect}
        canCreate={canCreate}
      />
    </>
  );
}
