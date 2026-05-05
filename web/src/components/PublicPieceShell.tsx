import type { ReactNode } from "react";
import { Suspense } from "react";
import { Box, CircularProgress, Container, Typography } from "@mui/material";
import ErrorBoundary from "./ErrorBoundary";

export default function PublicPieceShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Container
      maxWidth="lg"
      sx={{
        minHeight: "100dvh",
        pt: {
          xs: "max(12px, calc(env(safe-area-inset-top) + 8px))",
          sm: 2,
        },
        pb: 2,
        pl: {
          xs: "max(16px, env(safe-area-inset-left))",
          sm: 3,
        },
        pr: {
          xs: "max(16px, env(safe-area-inset-right))",
          sm: 3,
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Box
          component="img"
          src="/favicon.svg"
          alt="PotterDoc app icon"
          sx={{ width: 22, height: 22, flexShrink: 0, display: "block" }}
        />
        <Typography variant="h6" component="p" color="text.primary">
          PotterDoc
        </Typography>
      </Box>
      <ErrorBoundary>
        <Suspense
          fallback={
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          }
        >
          {children}
        </Suspense>
      </ErrorBoundary>
    </Container>
  );
}
