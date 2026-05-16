import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import WorkflowState from "./components/WorkflowState";
import type { PieceDetail, PieceState, UISchema } from "./util/types";
import type { UpdateStatePayload } from "./util/api";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1976d2" },
  },
});

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

  const root = createRoot(container);
  
  // Ensure we have a valid state object for the component
  const pieceState = {
    ...options.initialPieceState,
    custom_fields: options.initialPieceState.custom_fields || {},
    notes: options.initialPieceState.notes || "",
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
          saveStateFn={options.saveStateFn}
          hideImageUpload // Admin has its own image inlines for now
        />
      </ThemeProvider>
    </React.StrictMode>
  );

  return () => root.unmount();
};

window.mountWorkflowStateWidget = mountWorkflowStateWidget;
