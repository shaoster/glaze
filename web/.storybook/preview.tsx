import type { Preview } from "@storybook/react-vite";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import React from "react";
import { initialize, mswLoader } from "msw-storybook-addon";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { themes } from "@storybook/theming";

// Initialize MSW
initialize();

const DARK_THEME = createTheme({
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
    fontFamily: ["Manrope", "Avenir Next", "Segoe UI", "Arial", "sans-serif"].join(","),
  },
});

const preview: Preview = {
  decorators: [
    (Story) => {
      const router = createMemoryRouter([{ path: "/", element: <Story /> }], {
        initialEntries: ["/"],
      });
      return (
        <ThemeProvider theme={DARK_THEME}>
          <CssBaseline />
          <RouterProvider router={router} />
        </ThemeProvider>
      );
    },
  ],
  loaders: [mswLoader],
  parameters: {
    docs: {
      theme: themes.dark,
    },
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "#211b19" }],
    },
  },
};

export default preview;
