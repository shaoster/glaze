import { Suspense } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import AnalysisIndex from "../components/AnalysisIndex";
import GlazeCombinationGallery from "../components/GlazeCombinationGallery";
import ErrorBoundary from "../components/ErrorBoundary";

function SubRouteHeader({ title }: { title: string }) {
  return (
    <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
      <Button
        component={Link}
        to="/analyze"
        variant="text"
        size="small"
        startIcon={<ChevronLeftIcon />}
        sx={{ color: "text.secondary", ml: -1 }}
      >
        Back
      </Button>
      <Typography variant="h6" component="h1">
        {title}
      </Typography>
    </Box>
  );
}

export default function AnalyzePage() {
  const location = useLocation();
  const isIndex =
    location.pathname === "/analyze" || location.pathname === "/analyze/";

  return (
    <Box>
      {!isIndex && (
        <Routes>
          <Route
            path="glaze-combinations"
            element={<SubRouteHeader title="Glaze Combinations" />}
          />
        </Routes>
      )}
      <Routes>
        <Route index element={<AnalysisIndex />} />
        <Route
          path="glaze-combinations"
          element={
            <ErrorBoundary>
              <Suspense fallback={<CircularProgress sx={{ display: "block", mx: "auto", mt: 4 }} />}>
                <GlazeCombinationGallery />
              </Suspense>
            </ErrorBoundary>
          }
        />
      </Routes>
    </Box>
  );
}
