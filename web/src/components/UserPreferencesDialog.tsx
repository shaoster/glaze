import { useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import { fetchUserPreferences, type UserPreferences } from "../util/api";
import {
  getFieldDefinition,
  PREFERENCES_SCHEMA,
} from "../util/preferences";
import { useAsync, useAsyncFn } from "../util/useAsync";
import { getProcessSummaryFieldOptions } from "../util/workflow";
import {
  useCurrentUser,
  useSaveUserPreferences,
  type PreferencesSectionId,
} from "./CurrentUserContext";
import { DynamicPreferenceField } from "./DynamicPreferenceField";

type UserPreferencesDialogProps = {
  open: boolean;
  activeSectionId: PreferencesSectionId | null;
  onClose: () => void;
  onSectionChange: (sectionId: PreferencesSectionId | null) => void;
};

export default function UserPreferencesDialog({
  open,
  activeSectionId,
  onClose,
  onSectionChange,
}: UserPreferencesDialogProps) {
  const currentUser = useCurrentUser();
  const saveUserPreferences = useSaveUserPreferences();
  const { data, loading, error } = useAsync(fetchUserPreferences, [open], {
    enabled: open,
  });

  const saveState = useAsyncFn(
    async (preferences: UserPreferences, alias: string) => {
      if (!saveUserPreferences) {
        return null;
      }
      return saveUserPreferences(preferences, alias);
    },
    [saveUserPreferences],
  );

  const initialValues = useMemo(() => {
    const values: Record<string, any> = {};
    for (const section of PREFERENCES_SCHEMA.sections) {
      for (const [fieldId, field] of Object.entries(section.fields)) {
        if (field.storage === "UserProfile") {
          values[fieldId] =
            data?.[fieldId] ??
            currentUser?.[fieldId] ??
            (field.type === "string" ? "" : false);
        } else {
          // storage: UserProfile.preferences
          values[fieldId] =
            data?.preferences?.[fieldId] ??
            currentUser?.preferences?.[fieldId] ??
            (field.type === "field-multiselect" ? [] : true);
        }
      }
    }
    return values;
  }, [data, currentUser]);

  // Use a stable key that forces remount only when foundational data changes
  const preferencesKey = useMemo(() => JSON.stringify(initialValues), [initialValues]);

  return (
    <Dialog
      open={open}
      onClose={saveState.loading ? undefined : onClose}
      fullWidth
      maxWidth="md"
    >
      {(loading || saveState.loading) && <LinearProgress />}
      <DialogTitle>Preferences</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error ? (
            <Typography color="error">
              Failed to load your preferences.
            </Typography>
          ) : null}

          {saveState.error !== null ? (
            <Alert severity="error">
              Couldn't save your preferences. Please try again.
            </Alert>
          ) : null}

          <PreferencesForm
            key={preferencesKey}
            initialValues={initialValues}
            activeSectionId={activeSectionId}
            onSectionChange={onSectionChange}
            onSave={async (values) => {
              const profileUpdates: Record<string, any> = {};
              const preferenceUpdates: Record<string, any> = {};

              for (const [fieldId, value] of Object.entries(values)) {
                const field = getFieldDefinition(fieldId);
                if (field?.storage === "UserProfile") {
                  profileUpdates[fieldId] = value;
                } else {
                  preferenceUpdates[fieldId] = value;
                }
              }

              const response = await saveState.execute(
                preferenceUpdates as UserPreferences,
                profileUpdates.alias,
              );
              if (!response) {
                return;
              }
              onClose();
            }}
            onCancel={onClose}
            isSaving={saveState.loading}
          />

          <Typography variant="caption" color="text.secondary">
            The default workflow summary remains the fallback if no fields are
            selected.
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function PreferencesForm({
  initialValues,
  activeSectionId,
  onSectionChange,
  onSave,
  onCancel,
  isSaving,
}: {
  initialValues: Record<string, any>;
  activeSectionId: PreferencesSectionId | null;
  onSectionChange: (sectionId: PreferencesSectionId | null) => void;
  onSave: (values: Record<string, any>) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [values, setValues] = useState(initialValues);
  const options = useMemo(() => getProcessSummaryFieldOptions(), []);

  const handleChange = (fieldId: string, value: any) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  return (
    <>
      <Stack spacing={2}>
        {PREFERENCES_SCHEMA.sections.map((section) => (
          <Accordion
            key={section.id}
            disableGutters
            expanded={activeSectionId === section.id}
            onChange={(_, expanded) => {
              onSectionChange(expanded ? (section.id as any) : null);
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack spacing={0.25}>
                <Typography variant="subtitle1" component="span">
                  {section.title}
                </Typography>
                {section.description && (
                  <Typography variant="body2" color="text.secondary">
                    {section.description}
                  </Typography>
                )}
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                {Object.entries(section.fields).map(([fieldId, field]) => (
                  <DynamicPreferenceField
                    key={fieldId}
                    fieldId={fieldId}
                    field={field}
                    value={values[fieldId]}
                    onChange={(val) => handleChange(fieldId, val)}
                    isSaving={isSaving}
                    options={options}
                  />
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        ))}
      </Stack>
      <DialogActions>
        <Button onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void onSave(values)}
          disabled={isSaving}
        >
          Save
        </Button>
      </DialogActions>
    </>
  );
}
