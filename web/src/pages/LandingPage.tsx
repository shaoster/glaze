import { useLocation, useNavigate, Outlet } from "react-router-dom";
import { Box, Tab, Tabs, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";

// Height of the fixed bottom tab bar on mobile
export const BOTTOM_TAB_BAR_HEIGHT = 56;

export default function LandingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentTab = location.pathname.startsWith("/analyze") ? "/analyze" : "/";
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  if (isMobile) {
    return (
      <>
        <Box sx={{ pt: 2, pb: `${BOTTOM_TAB_BAR_HEIGHT + 16}px` }}>
          <Outlet />
        </Box>

        <Box
          component="nav"
          aria-label="Main navigation"
          sx={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: (t) => t.zIndex.appBar,
            height: BOTTOM_TAB_BAR_HEIGHT,
            bgcolor: "rgba(24, 18, 16, 0.92)",
            backdropFilter: "blur(12px)",
            borderTop: "1px solid",
            borderColor: "divider",
            pb: "env(safe-area-inset-bottom)",
          }}
        >
          <Tabs
            value={currentTab}
            onChange={(_event, nextTab: string) => navigate(nextTab)}
            aria-label="Landing page navigation"
            variant="fullWidth"
            sx={{
              height: "100%",
              "& .MuiTabs-flexContainer": { height: "100%" },
              "& .MuiTab-root": {
                height: "100%",
                minHeight: "unset",
                textTransform: "none",
                fontSize: "0.75rem",
                fontWeight: 600,
                letterSpacing: "0.02em",
                "&:not(.Mui-selected)": { color: "text.disabled" },
              },
              "& .MuiTabs-indicator": {
                top: 0,
                bottom: "unset",
                height: 2,
              },
            }}
          >
            <Tab label="Pieces" value="/" />
            <Tab label="Analyze" value="/analyze" />
          </Tabs>
        </Box>
      </>
    );
  }

  return (
    <Box sx={{ pt: 1.5, pb: 2 }}>
      <Tabs
        value={currentTab}
        onChange={(_event, nextTab: string) => navigate(nextTab)}
        aria-label="Landing page navigation"
        variant="fullWidth"
        sx={{
          mb: 2.5,
          minHeight: 52,
          "& .MuiTab-root": {
            minHeight: 52,
            textTransform: "none",
            fontSize: { xs: "0.95rem", sm: "1rem" },
          },
        }}
      >
        <Tab label="Pieces" value="/" />
        <Tab label="Analyze" value="/analyze" />
      </Tabs>
      <Outlet />
    </Box>
  );
}
