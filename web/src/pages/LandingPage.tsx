import { useLocation, useNavigate, Outlet } from "react-router-dom";
import { Box, Tab, Tabs } from "@mui/material";

export default function LandingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentTab = location.pathname === "/analyze" ? "/analyze" : "/";

  return (
    <Box sx={{ pb: 2 }}>
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
