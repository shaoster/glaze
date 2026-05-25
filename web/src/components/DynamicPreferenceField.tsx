import {
  Box,
  Checkbox,
  Divider,
  FormControlLabel,
  FormGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo } from "react";
import type { PreferenceField } from "../util/preferences";
import type { ProcessSummaryFieldOption } from "../util/workflow";

export interface DynamicPreferenceFieldProps {
  fieldId: string;
  field: PreferenceField;
  value: unknown;
  onChange: (value: unknown) => void;
  isSaving: boolean;
  options: ProcessSummaryFieldOption[];
}

export function DynamicPreferenceField({
  field,
  value,
  onChange,
  isSaving,
  options,
}: DynamicPreferenceFieldProps) {
  const groupedOptions = useMemo(() => {
    if (field.type !== "field-list") {
      return [];
    }
    const grouped = new Map<string, ProcessSummaryFieldOption[]>();
    for (const option of options) {
      const groupFields = grouped.get(option.group) ?? [];
      groupFields.push(option);
      grouped.set(option.group, groupFields);
    }
    return Array.from(grouped, ([title, fields]) => ({ title, fields }));
  }, [field.type, options]);

  if (field.type === "string") {
    return (
      <TextField
        label={field.label}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value.slice(0, field.max_length))}
        helperText={field.hint}
        fullWidth
        disabled={isSaving}
        inputProps={{ maxLength: field.max_length }}
      />
    );
  }

  if (field.type === "field-list") {
    return (
      <Stack spacing={2}>
        {groupedOptions.map((section) => (
          <Box key={section.title}>
            <Typography
              variant="subtitle2"
              sx={{
                mb: 1,
                color: "text.secondary",
                fontWeight: 700,
              }}
            >
              {section.title}
            </Typography>
            <FormGroup>
              {section.fields.map((f) => (
                <FormControlLabel
                  key={f.ref}
                  control={
                    <Checkbox
                      checked={((value as string[]) ?? []).includes(f.ref)}
                      onChange={() => {
                        const prev = (value as string[]) ?? [];
                        onChange(
                          prev.includes(f.ref)
                            ? prev.filter((v) => v !== f.ref)
                            : [...prev, f.ref],
                        );
                      }}
                    />
                  }
                  label={
                    <Stack spacing={0.25}>
                      <Typography variant="body2">{f.label}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {f.ref}
                      </Typography>
                    </Stack>
                  }
                />
              ))}
            </FormGroup>
            <Divider sx={{ mt: 1.5 }} />
          </Box>
        ))}
      </Stack>
    );
  }

  if (field.type === "boolean") {
    return (
      <FormControlLabel
        control={
          <Checkbox
            checked={(value as boolean) ?? true}
            onChange={() => onChange(!((value as boolean) ?? true))}
          />
        }
        label={
          <Stack spacing={0.25}>
            <Typography variant="body2">{field.label}</Typography>
            {field.hint && (
              <Typography variant="caption" color="text.secondary">
                {field.hint}
              </Typography>
            )}
          </Stack>
        }
      />
    );
  }

  return null;
}
