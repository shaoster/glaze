import { Box, Button, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";

interface AppFooterLinksProps {
  onContactUs: () => void;
  sticky?: boolean;
}

export default function AppFooterLinks({
  onContactUs,
  sticky = false,
}: AppFooterLinksProps) {
  return (
    <Box
      component="footer"
      sx={{
        pt: 1,
        pb: sticky ? 1 : 0,
        mt: sticky ? 2 : 0,
        position: sticky ? "sticky" : "static",
        bottom: sticky ? 0 : "auto",
        zIndex: sticky ? 1 : "auto",
        bgcolor: sticky ? "background.default" : "transparent",
        borderTop: sticky ? 1 : 0,
        borderColor: sticky ? "divider" : "transparent",
        backdropFilter: sticky ? "blur(16px)" : "none",
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        justifyContent="center"
        alignItems="center"
        flexWrap="wrap"
      >
        <Button
          component={Link}
          to="/about"
          variant="text"
          size="small"
          sx={{ minWidth: 0, px: 0.5 }}
        >
          About Us
        </Button>
        <Typography variant="body2" color="text.secondary">
          •
        </Typography>
        <Button
          component={Link}
          to="/privacy-policy"
          variant="text"
          size="small"
          sx={{ minWidth: 0, px: 0.5 }}
        >
          Privacy Policy
        </Button>
        <Typography variant="body2" color="text.secondary">
          •
        </Typography>
        <Button
          component={Link}
          to="/terms-of-service"
          variant="text"
          size="small"
          sx={{ minWidth: 0, px: 0.5 }}
        >
          Terms of Service
        </Button>
        <Typography variant="body2" color="text.secondary">
          •
        </Typography>
        <Button
          type="button"
          onClick={onContactUs}
          variant="text"
          size="small"
          sx={{ minWidth: 0, px: 0.5 }}
        >
          Contact Us
        </Button>
      </Stack>
    </Box>
  );
}
