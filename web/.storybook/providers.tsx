/**
 * Provider stack shared by preview.tsx (Storybook) and storybook-smoke.test.tsx (Vitest).
 *
 * Keeping providers in one place ensures the smoke tests exercise the same
 * environment as the deployed Storybook. If a provider is added here it is
 * automatically tested; if one is removed the smoke tests will catch it.
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

// Stable QueryClient instance: safe across story renders in Storybook's iframe
// and across tests in Vitest (each test file gets its own module scope).
const queryClient = new QueryClient();

export const DARK_THEME = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#c97a4d", light: "#d59a71", dark: "#8f5230" },
    secondary: { main: "#8ca6a3" },
    background: { default: "#211b19", paper: "#2a2321" },
    text: { primary: "#f3ebe1", secondary: "#bbaea1" },
    divider: "rgba(255, 245, 235, 0.09)",
    success: { main: "#8eb89a" },
    warning: { main: "#c97a4d" },
  },
  typography: {
    fontFamily: [
      "Manrope",
      "Avenir Next",
      "Segoe UI",
      "Arial",
      "sans-serif",
    ].join(","),
  },
});

interface StorybookProvidersProps {
  children: React.ReactNode;
}

/**
 * Wraps children with all providers required by Glaze's Storybook stories.
 * Used by preview.tsx and storybook-smoke.test.tsx.
 */
export function StorybookProviders({ children }: StorybookProvidersProps) {
  const router = createMemoryRouter([{ path: "/", element: <>{children}</> }], {
    initialEntries: ["/"],
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={DARK_THEME}>
        <CssBaseline />
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
