import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import ScopedCssBaseline from "@mui/material/ScopedCssBaseline";
import WorkflowState from "./components/WorkflowState";
import type { PieceDetail, PieceState, UISchema } from "./util/types";
import type { UpdateStatePayload } from "./util/api";

const getDjangoTheme = (): "light" | "dark" => {
  if (document.documentElement.dataset.theme === "dark") return "dark";
  if (document.body.classList.contains("dark-mode")) return "dark";
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
};

const createAdminTheme = (mode: "light" | "dark") => {
  const isDark = mode === "dark";
  const bgColor = isDark ? "#121212" : "#fff";
  const fgColor = isDark ? "#eee" : "#333";
  const primaryColor = isDark ? "#79aec8" : "#447e9b";
  const paperColor = isDark ? "#1e1e1e" : "#fff";

  return createTheme({
    palette: {
      mode,
      primary: { main: primaryColor },
      background: {
        default: bgColor,
        paper: paperColor,
      },
      text: {
        primary: fgColor,
        secondary: isDark ? "#aaa" : "#666",
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
    return () => {{
      // cleanup
    }};
  }

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

  const rawState = (initialPieceState || {}) as Record<string, unknown>;
  const pieceState = { ...rawState } as unknown as PieceState;
  
  if (!pieceState.images) pieceState.images = [];
  if (!pieceState.custom_fields) pieceState.custom_fields = {};
  if (pieceState.notes === undefined || pieceState.notes === null) pieceState.notes = "";

  const globalRefValues = rawState.global_ref_values as Record<string, unknown> | undefined;
  if (globalRefValues) {
    pieceState.custom_fields = {
      ...pieceState.custom_fields,
      ...globalRefValues,
    };
  }

  const themeMode = getDjangoTheme();
  const theme = createAdminTheme(themeMode);

  const wrappedSaveStateFn = async (payload: UpdateStatePayload): Promise<PieceDetail> => {
    if (options.saveStateFn) {
      await options.saveStateFn(payload);
    }
    
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
        <ScopedCssBaseline>
          <WorkflowState
            initialPieceState={pieceState}
            pieceId={options.pieceId}
            onSaved={options.onSaved || (() => {{
              // no-op
            }})}
            onDirtyChange={options.onDirtyChange}
            uiSchema={options.uiSchema}
            saveStateFn={wrappedSaveStateFn}
            hideImageUpload
            disableAutosave
            hideNotes // Always exclude notes in Admin (redundant with parent form)
          />
        </ScopedCssBaseline>
      </ThemeProvider>
    </React.StrictMode>
  );

  return () => {
    root.unmount();
    portalContainer?.remove();
  };
};

window.mountWorkflowStateWidget = mountWorkflowStateWidget;
