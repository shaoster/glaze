import { Suspense } from "react";
import { Stack, Typography, Box, alpha, CircularProgress } from "@mui/material";
import AnalysisCard from "./AnalysisCard";
import GlazeCombinationSummary from "./GlazeCombinationSummary";
import ErrorBoundary from "./ErrorBoundary";

export default function AnalysisIndex() {
  return (
    <Stack spacing={2}>
      <AnalysisCard
        title="Glaze Combinations"
        description="Browse images of glaze combinations applied to your pieces."
        to="/analyze/glaze-combinations"
        summary={
          <ErrorBoundary>
            <Suspense fallback={<CircularProgress size={16} />}>
              <GlazeCombinationSummary />
            </Suspense>
          </ErrorBoundary>
        }
      />

      <AnalysisCard
        title="Firing Results"
        description="Coming soon: Analyze results across different firing programs and temperatures."
        to="/analyze" // Keep on index for now since it's a placeholder
        summary={
          <Box
            sx={{
              height: 40,
              display: "flex",
              alignItems: "center",
              px: 1.5,
              borderRadius: 1,
              bgcolor: alpha("#000", 0.05),
              border: "1px dashed",
              borderColor: "divider",
              width: "fit-content",
            }}
          >
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ fontStyle: "italic" }}
            >
              Future analysis module
            </Typography>
          </Box>
        }
      />
    </Stack>
  );
}
