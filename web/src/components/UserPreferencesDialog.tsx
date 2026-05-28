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
import { getFieldDefinition, PREFERENCES_SCHEMA } from "../util/preferences";
import { useMutation, useQuery } from "@tanstack/react-query";
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
  const { data, isLoading: loading, error } = useQuery({
    queryKey: ["userPreferences"],
    queryFn: fetchUserPreferences,
    enabled: open,
  });

  const { mutate: savePreferences, isPending: savePending, error: saveError, reset: resetSave } = useMutation({
    mutationFn: async ({ preferences, alias }: { preferences: UserPreferences; alias: string }) => {
      if (!saveUserPreferences) return null;
      return saveUserPreferences(preferences, alias);
    },
  });

  const initialValues = useMemo(() => {
    const values: Record<string, unknown> = {};
    for (const section of PREFERENCES_SCHEMA.sections) {
      for (const [fieldId, field] of Object.entries(section.fields)) {
        if (field.storage === "UserProfile") {
          values[fieldId] =
            (data as Record<string, unknown> | undefined)?.[fieldId] ??
            (currentUser as Record<string, unknown> | null)?.[fieldId] ??
            (field.type === "string" ? "" : false);
        } else {
          // storage: UserProfile.preferences
          values[fieldId] =
            (data?.preferences as Record<string, unknown> | undefined)?.[
              fieldId
            ] ??
            (currentUser?.preferences as Record<string, unknown> | undefined)?.[
              fieldId
            ] ??
            (field.type === "field-list" ? [] : true);
        }
      }
    }
    return values;
  }, [data, currentUser]);

  // Use a stable key that forces remount only when foundational data changes
  const preferencesKey = useMemo(
    () => JSON.stringify(initialValues),
    [initialValues],
  );

  return (
    <Dialog
      open={open}
      onClose={savePending ? undefined : onClose}
      fullWidth
      maxWidth="md"
    >
      {(loading || savePending) && <LinearProgress />}
      <DialogTitle>Preferences</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error ? (
            <Typography color="error">
              Failed to load your preferences.
            </Typography>
          ) : null}

          {saveError !== null ? (
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
              const profileUpdates: Record<string, string> = {};
              const preferenceUpdates: Record<string, unknown> = {};

              for (const [fieldId, value] of Object.entries(values)) {
                const field = getFieldDefinition(fieldId);
                if (field?.storage === "UserProfile") {
                  profileUpdates[fieldId] = value as string;
                } else {
                  preferenceUpdates[fieldId] = value;
                }
              }

              resetSave();
              savePreferences(
                { preferences: preferenceUpdates as UserPreferences, alias: profileUpdates.alias },
                { onSuccess: (response) => { if (response) onClose(); } },
              );
            }}
            onCancel={onClose}
            isSaving={savePending}
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
  initialValues: Record<string, unknown>;
  activeSectionId: PreferencesSectionId | null;
  onSectionChange: (sectionId: PreferencesSectionId | null) => void;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [values, setValues] = useState(initialValues);
  const options = useMemo(() => getProcessSummaryFieldOptions(), []);

  const handleChange = (fieldId: string, value: unknown) => {
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
              onSectionChange(
                expanded ? (section.id as PreferencesSectionId) : null,
              );
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
