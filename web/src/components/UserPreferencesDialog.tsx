import { useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import {
  fetchUserPreferences,
  type UserPreferences,
  type TutorialVisibility,
} from "../util/api";
import { TUTORIAL_TOGGLE_KEYS } from "../util/tutorials";
import { useAsync, useAsyncFn } from "../util/useAsync";
import { getProcessSummaryFieldOptions } from "../util/workflow";
import {
  useCurrentUser,
  useSaveUserPreferences,
  type PreferencesSectionId,
} from "./CurrentUserContext";

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
  const options = useMemo(() => getProcessSummaryFieldOptions(), []);
  const saveState = useAsyncFn(
    async (preferences: UserPreferences, alias: string) => {
      if (!saveUserPreferences) {
        return null;
      }
      return saveUserPreferences(preferences, alias);
    },
    [saveUserPreferences],
  );
  const initialAlias = data?.alias ?? currentUser?.alias ?? "";
  const initialSelectedRefs =
    data?.preferences.process_summary_fields ??
    currentUser?.preferences.process_summary_fields ??
    [];
  const initialTutorialVisibility =
    data?.preferences.tutorials[
      TUTORIAL_TOGGLE_KEYS.SUMMARY_CUSTOMIZE_POPUP
    ] ??
    currentUser?.preferences.tutorials[
      TUTORIAL_TOGGLE_KEYS.SUMMARY_CUSTOMIZE_POPUP
    ] ??
    "show";
  const preferencesKey = `${initialAlias}::${initialSelectedRefs.join("|")}::${initialTutorialVisibility}`;

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
          {error ? (
            <Typography color="error">
              Failed to load your preferences.
            </Typography>
          ) : null}

          <PreferencesForm
            key={preferencesKey}
            sections={sections}
            initialAlias={initialAlias}
            initialSelectedRefs={initialSelectedRefs}
            initialTutorialVisibility={initialTutorialVisibility}
            activeSectionId={activeSectionId}
            onSectionChange={onSectionChange}
            onSave={async (alias, selectedRefs, tutorialVisibility) => {
              const response = await saveState.execute(
                {
                  process_summary_fields: selectedRefs,
                  tutorials: {
                    [TUTORIAL_TOGGLE_KEYS.SUMMARY_CUSTOMIZE_POPUP]:
                      tutorialVisibility,
                  },
                },
                alias,
              );
              if (!response) {
                return;
              }
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
  initialAlias,
  initialSelectedRefs,
  initialTutorialVisibility,
  activeSectionId,
  onSectionChange,
  onSave,
  onCancel,
  isSaving,
}: {
  sections: { title: string; fields: { ref: string; label: string }[] }[];
  initialAlias: string;
  initialSelectedRefs: string[];
  initialTutorialVisibility: TutorialVisibility;
  activeSectionId: PreferencesSectionId | null;
  onSectionChange: (sectionId: PreferencesSectionId | null) => void;
  onSave: (
    alias: string,
    selectedRefs: string[],
    tutorialVisibility: TutorialVisibility,
  ) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [alias, setAlias] = useState(initialAlias);
  const [selectedRefs, setSelectedRefs] = useState(initialSelectedRefs);
  const [tutorialVisibility, setTutorialVisibility] =
    useState<TutorialVisibility>(initialTutorialVisibility);

  function toggleRef(ref: string) {
    setSelectedRefs((prev) =>
      prev.includes(ref) ? prev.filter((value) => value !== ref) : [...prev, ref],
    );
  }

  return (
    <>
      <Stack spacing={2}>
        <TextField
          label="Alias"
          value={alias}
          onChange={(e) => setAlias(e.target.value.slice(0, 50))}
          helperText="How you'd like to identify yourself in the app. Not visible to others."
          fullWidth
          disabled={isSaving}
          inputProps={{ maxLength: 50 }}
        />
        <Accordion
          disableGutters
          expanded={activeSectionId === "process-summary"}
          onChange={(_, expanded) => {
            if (expanded) {
              onSectionChange("process-summary");
            } else if (activeSectionId === "process-summary") {
              onSectionChange(null);
            }
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack spacing={0.25}>
              <Typography variant="subtitle1" component="span">
                Process Summary
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Choose which fields appear in process summaries.
              </Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              {sections.map((section) => (
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
                            <Typography variant="body2">
                              {field.label}
                            </Typography>
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
          </AccordionDetails>
        </Accordion>
        <Accordion
          disableGutters
          expanded={activeSectionId === "tutorials"}
          onChange={(_, expanded) => {
            if (expanded) {
              onSectionChange("tutorials");
            } else if (activeSectionId === "tutorials") {
              onSectionChange(null);
            }
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack spacing={0.25}>
              <Typography variant="subtitle1" component="span">
                Tutorials
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Small stubs that point to upcoming guided help.
              </Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={tutorialVisibility === "show"}
                    onChange={() =>
                      setTutorialVisibility((prev) =>
                        prev === "show" ? "don't" : "show",
                      )
                    }
                  />
                }
                label={
                  <Stack spacing={0.25}>
                    <Typography variant="body2">
                      Show the summary customization tip
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Controls the summary guidance shown on piece details.
                    </Typography>
                  </Stack>
                }
              />
            </FormGroup>
          </AccordionDetails>
        </Accordion>
      </Stack>
      <DialogActions>
        <Button onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void onSave(alias, selectedRefs, tutorialVisibility)}
          disabled={isSaving}
        >
          Save
        </Button>
      </DialogActions>
    </>
  );
}
