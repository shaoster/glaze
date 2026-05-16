import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import WorkflowState from "./components/WorkflowState";
import type { PieceDetail, PieceState, UISchema } from "./util/types";
import type { UpdateStatePayload } from "./util/api";

const getDjangoTheme = (): "light" | "dark" => {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
};

const createAdminTheme = (mode: "light" | "dark") => {
  const bgColor = mode === "dark" ? "#121212" : "#fff";
  return createTheme({
    palette: {
      mode,
      primary: { main: "#1976d2" },
      background: {
        default: bgColor,
        paper: mode === "dark" ? "#1e1e1e" : "#fff",
      },
    },
    components: {
      MuiTextField: {
        defaultProps: {
          variant: "outlined",
          size: "small",
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            // Ensure the label's background matches the theme background
            // so the 'notch' in outlined fields works correctly.
            backgroundColor: bgColor,
            padding: "0 4px",
            marginLeft: "-4px",
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
        <CssBaseline />
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

  return () => root.unmount();
};

window.mountWorkflowStateWidget = mountWorkflowStateWidget;
