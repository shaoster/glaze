import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";

import TagChip from "./TagChip";
import type { TagEntry } from "../util/types";

const CREATE_NEW_ID = "__create_new__";
const CREATE_NEW_OPTION: TagEntry = { id: CREATE_NEW_ID, name: "+ New tag", is_public: false };

interface TagAutocompleteProps {
  label: string;
  options: TagEntry[];
  value: TagEntry[];
  onChange: (value: TagEntry[]) => void;
  onCreateNew?: () => void;
  disabled?: boolean;
  sx?: SxProps<Theme>;
}

export default function TagAutocomplete({
  label,
  options,
  value,
  onChange,
  onCreateNew,
  disabled = false,
  sx,
}: TagAutocompleteProps) {
  const optionsWithCreate: TagEntry[] = onCreateNew
    ? [...options, CREATE_NEW_OPTION]
    : options;

  return (
    <Autocomplete
      multiple
      size="small"
      options={optionsWithCreate}
      value={value}
      onChange={(_event, nextValue) => {
        const hasCreate = nextValue.some((v) => v.id === CREATE_NEW_ID);
        if (hasCreate) {
          onCreateNew?.();
          onChange(nextValue.filter((v) => v.id !== CREATE_NEW_ID));
        } else {
          onChange(nextValue);
        }
      }}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      renderOption={(props, option) => {
        if (option.id === CREATE_NEW_ID) {
          const { key, ...restProps } = props as { key: React.Key } & React.HTMLAttributes<HTMLLIElement>;
          return (
            <Box
              component="li"
              key={key}
              {...restProps}
              sx={{
                display: "inline-flex !important",
                alignItems: "center",
                px: "12px !important",
                py: "6px !important",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: "4px",
                  border: "1px dashed",
                  borderColor: "divider",
                  color: "text.secondary",
                  background: "transparent",
                }}
              >
                + New tag
              </Typography>
            </Box>
          );
        }
        const { key, ...restProps } = props as { key: React.Key } & React.HTMLAttributes<HTMLLIElement>;
        return (
          <Box component="li" key={key} {...restProps}>
            {option.name}
          </Box>
        );
      }}
      renderValue={(selected, getTagProps) =>
        selected.map((option, index) => (
          <TagChip
            key={option.id}
            label={option.name}
            color={option.color}
            onDelete={() => getTagProps({ index }).onDelete?.({} as never)}
          />
        ))
      }
      renderInput={(params) => (
        <TextField {...params} label={label} fullWidth />
      )}
      disabled={disabled}
      sx={[
        {
          width: "100%",
          "& .MuiAutocomplete-inputRoot": {
            alignItems: "flex-start",
            ...(value.length > 0 ? { paddingTop: "10px !important" } : {}),
          },
          "& .MuiAutocomplete-tag": {
            maxWidth: "100%",
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
