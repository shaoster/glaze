import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import WorkflowState from "./components/WorkflowState";
import type { PieceDetail, PieceState, UISchema } from "./util/types";
import type { UpdateStatePayload } from "./util/api";

const getDjangoTheme = (): "light" | "dark" => {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
};

const createAdminTheme = (mode: "light" | "dark") => {
  return createTheme({
    palette: {
      mode,
      primary: { main: "var(--primary, #1976d2)" },
      background: {
        default: "var(--body-bg, #fff)",
        paper: "var(--body-bg, #fff)",
      },
      text: {
        primary: "var(--body-fg, #333)",
        secondary: "var(--body-fg, #333)",
      },
      divider: "var(--border-color, #ccc)",
    },
    components: {
      MuiTextField: {
        defaultProps: {
          variant: "outlined",
          size: "small",
        },
        styleOverrides: {
          root: {
            // Ensure inputs don't have their own backgrounds that occlude labels
            "& .MuiInputBase-root": {
              backgroundColor: "transparent",
            },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            // Match the Django background to fix the notch occlusion
            backgroundColor: "var(--body-bg, #fff)",
            padding: "0 4px",
            marginLeft: "-4px",
            color: "var(--body-fg, #333)",
            "&.Mui-focused": {
              color: "var(--primary, #1976d2)",
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: "var(--border-color, #ccc)",
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: "var(--body-fg, #333)",
            },
          },
        },
      },
    },
  });
};

interface MountOptions {
  containerId: string;
  initialPieceState: PieceState;
  pieceId: string;
  uiSchema?: UISchema;
  onSaved?: (updated: PieceDetail) => void;
  onDirtyChange?: (dirty: boolean) => void;
  saveStateFn?: (payload: UpdateStatePayload) => Promise<PieceDetail>;
}

declare global {
  interface Window {
    mountWorkflowStateWidget: (options: MountOptions) => () => void;
  }
}

export const mountWorkflowStateWidget = (options: MountOptions) => {
  console.log("Mounting WorkflowState widget...", options);
  const container = document.getElementById(options.containerId);
  if (!container) {
    console.error(`Container #${options.containerId} not found`);
    return () => {};
  }

  // Create a dedicated container for MUI portals (Autocomplete, Dialogs, etc.)
  // to avoid MutationObserver issues with the Admin's legacy DOM structure.
  const portalContainerId = `portal-root-${options.containerId}`;
  let portalContainer = document.getElementById(portalContainerId);
  if (!portalContainer) {
    portalContainer = document.createElement("div");
    portalContainer.id = portalContainerId;
    document.body.appendChild(portalContainer);
  }

  const root = createRoot(container);

  let initialPieceState = options.initialPieceState;
  if (typeof initialPieceState === "string") {
    try {
      initialPieceState = JSON.parse(initialPieceState);
    } catch (e) {
      console.error("Failed to parse initialPieceState string:", e);
    }
  }

  // Ensure we have a valid state object for the component.
  const rawState = (initialPieceState || {}) as Record<string, unknown>;
  const pieceState = { ...rawState } as unknown as PieceState;
  
  if (!pieceState.images) pieceState.images = [];
  if (!pieceState.custom_fields) pieceState.custom_fields = {};
  if (pieceState.notes === undefined || pieceState.notes === null) pieceState.notes = "";

  // Merge global_ref_values (provided by Django Admin) into custom_fields
  // so buildDraftState can correctly resolve the initial global reference PKs.
  const globalRefValues = rawState.global_ref_values as Record<string, unknown> | undefined;
  if (globalRefValues) {
    pieceState.custom_fields = {
      ...pieceState.custom_fields,
      ...globalRefValues,
    };
  }

  const theme = createAdminTheme(getDjangoTheme());

  const wrappedSaveStateFn = async (payload: UpdateStatePayload): Promise<PieceDetail> => {
    if (options.saveStateFn) {
      await options.saveStateFn(payload);
    }
    
    // WorkflowState expects the returned result to contain the updated state
    // in history so it can refresh the local draft and stop the "Saving..." spinner.
    const updatedPieceState: PieceState = {
      ...pieceState,
      notes: payload.notes ?? "",
      images: payload.images ?? [],
      custom_fields: payload.custom_fields ?? {},
    };

    return {
      id: options.pieceId,
      name: "Admin Edit",
      current_state: updatedPieceState,
      history: [updatedPieceState],
      is_owner: true,
      can_edit: true,
    } as unknown as PieceDetail;
  };

  root.render(
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <WorkflowState
          initialPieceState={pieceState}
          pieceId={options.pieceId}
          onSaved={options.onSaved || (() => {})}
          onDirtyChange={options.onDirtyChange}
          uiSchema={options.uiSchema}
          saveStateFn={wrappedSaveStateFn}
          hideImageUpload // Admin has its own image inlines for now
        />
      </ThemeProvider>
    </React.StrictMode>
  );

  return () => {
    root.unmount();
    portalContainer?.remove();
  };
};

window.mountWorkflowStateWidget = mountWorkflowStateWidget;
