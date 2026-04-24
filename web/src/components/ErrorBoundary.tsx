import { Component } from "react";
import type { ReactNode } from "react";
import { Typography } from "@mui/material";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary for the route subtree.
 *
 * Catches render errors thrown by any descendant component and renders a
 * recoverable "Something went wrong" message instead of letting the crash
 * unmount the entire application. React requires error boundaries to be
 * class components.
 *
 * Usage: wrap the <Outlet /> in AppShell (or any major subtree) with this
 * component so that a crash in a page component does not take down the
 * navigation shell.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Typography color="error" sx={{ mt: 4 }}>
          Something went wrong. Please reload the page.
        </Typography>
      );
    }
    return this.props.children;
  }
}
