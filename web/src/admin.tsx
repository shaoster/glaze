import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import ScopedCssBaseline from "@mui/material/ScopedCssBaseline";
import WorkflowState from "./components/WorkflowState";
import type { PieceDetail, PieceState, UISchema } from "./util/types";
import type { UpdateStatePayload } from "./util/api";

const getDjangoTheme = (): "light" | "dark" => {
  const theme = document.documentElement.dataset.theme;
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  
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
          variant: "standard",
          size: "small",
          fullWidth: true,
        },
        styleOverrides: {
          root: {
            margin: 0,
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            backgroundColor: "transparent",
            padding: 0,
            marginLeft: 0,
            transform: "translate(0, -4px) scale(0.75)",
            "&.Mui-focused": {
              transform: "translate(0, -4px) scale(0.75)",
            },
          },
          shrink: {
            transform: "translate(0, -4px) scale(0.75)",
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
  onChange?: (payload: UpdateStatePayload) => void;
}

declare global {
  interface Window {
    mountWorkflowStateWidget: (options: MountOptions) => () => void;
  }
}

export const mountWorkflowStateWidget = (options: MountOptions) => {
  const themeMode = getDjangoTheme();
  console.log(`Mounting WorkflowState widget (theme: ${themeMode})...`, options);
  
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
            onChange={options.onChange}
            hideImageUpload
            disableAutosave
            hideNotes
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
