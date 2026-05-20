import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  FormGroup,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";

import {
  fetchUserPreferences,
  updateUserPreferences,
  type AuthUser,
  type UserPreferences,
} from "../util/api";
import { useAsync, useAsyncFn } from "../util/useAsync";
import { getProcessSummaryFieldOptions } from "../util/workflow";
import { useCurrentUser } from "./CurrentUserContext";

type UserPreferencesDialogProps = {
  open: boolean;
  onClose: () => void;
  onSaved: (user: AuthUser) => void;
};

export default function UserPreferencesDialog({
  open,
  onClose,
  onSaved,
}: UserPreferencesDialogProps) {
  const currentUser = useCurrentUser();
  const { data, loading, error } = useAsync(fetchUserPreferences, [open], {
    enabled: open,
  });
  const options = useMemo(() => getProcessSummaryFieldOptions(), []);
  const saveState = useAsyncFn(
    async (preferences: UserPreferences) => updateUserPreferences(preferences),
    [],
  );
  const initialSelectedRefs =
    data?.preferences.process_summary_fields ??
    currentUser?.preferences.process_summary_fields ??
    [];
  const preferencesKey = initialSelectedRefs.join("|");

  const sections = useMemo(() => {
    const grouped = new Map<string, typeof options>();
    for (const option of options) {
      const section = grouped.get(option.group) ?? [];
      section.push(option);
      grouped.set(option.group, section);
    }
    return Array.from(grouped, ([title, fields]) => ({ title, fields }));
  }, [options]);

  const isSaving = saveState.loading;

  return (
    <Dialog
      open={open}
      onClose={isSaving ? undefined : onClose}
      fullWidth
      maxWidth="md"
    >
      {(loading || isSaving) && <LinearProgress />}
      <DialogTitle>Preferences</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" gutterBottom>
              Process Summary
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Choose which fields should appear in your process summaries.
              Images are excluded.
            </Typography>
          </Box>

          {error ? (
            <Typography color="error">
              Failed to load your preferences.
            </Typography>
          ) : null}

          <PreferencesForm
            key={preferencesKey}
            sections={sections}
            initialSelectedRefs={initialSelectedRefs}
            onSave={async (selectedRefs) => {
              const response = await saveState.execute({
                process_summary_fields: selectedRefs,
              });
              if (!response || !currentUser) {
                return;
              }
              onSaved({
                ...currentUser,
                preferences: response.preferences,
              });
              onClose();
            }}
            onCancel={onClose}
            isSaving={isSaving}
          />

          <Typography variant="caption" color="text.secondary">
            The default workflow summary remains the fallback if no fields are selected.
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function PreferencesForm({
  sections,
  initialSelectedRefs,
  onSave,
  onCancel,
  isSaving,
}: {
  sections: { title: string; fields: { ref: string; label: string }[] }[];
  initialSelectedRefs: string[];
  onSave: (selectedRefs: string[]) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [selectedRefs, setSelectedRefs] = useState(initialSelectedRefs);

  function toggleRef(ref: string) {
    setSelectedRefs((prev) =>
      prev.includes(ref) ? prev.filter((value) => value !== ref) : [...prev, ref],
    );
  }

  return (
    <>
      <Stack spacing={2}>
        {sections.map((section) => (
          <Box key={section.title}>
            <Typography
              variant="subtitle2"
              sx={{
                mb: 1,
                color: "text.secondary",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {section.title}
            </Typography>
            <FormGroup>
              {section.fields.map((field) => (
                <FormControlLabel
                  key={field.ref}
                  control={
                    <Checkbox
                      checked={selectedRefs.includes(field.ref)}
                      onChange={() => toggleRef(field.ref)}
                    />
                  }
                  label={
                    <Stack spacing={0.25}>
                      <Typography variant="body2">{field.label}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {field.ref}
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
      <DialogActions>
        <Button onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void onSave(selectedRefs)}
          disabled={isSaving}
        >
          Save
        </Button>
      </DialogActions>
    </>
  );
}
