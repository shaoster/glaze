import { useState } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { alpha, Box, Collapse, List, ListItem, ListItemText, Typography } from "@mui/material";
import type { PieceState } from "../util/types";
import { formatPastState } from "../util/types";

type PieceHistoryProps = {
  pastHistory: PieceState[];
};

export default function PieceHistory({ pastHistory }: PieceHistoryProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  if (pastHistory.length === 0) return null;

  return (
    <Box>
      <Box
        component="button"
        type="button"
        onClick={() => setHistoryOpen((o) => !o)}
        aria-expanded={historyOpen}
        sx={(theme) => ({
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          mb: 1.5,
          px: 0,
          py: 0.5,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: theme.palette.text.secondary,
          textAlign: "left",
        })}
      >
        <ExpandMoreIcon
          sx={{
            fontSize: 16,
            transition: "transform 0.2s",
            transform: historyOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
        <Typography variant="body2" sx={{ color: "inherit" }}>
          {historyOpen ? "Hide" : "Show"} history ({pastHistory.length} past
          state{pastHistory.length !== 1 ? "s" : ""})
        </Typography>
      </Box>
      <Collapse in={historyOpen}>
        <List dense sx={{ display: "grid", gap: 1.25 }}>
          {pastHistory.map((ps, i) => (
            <ListItem
              key={i}
              disableGutters
              sx={(theme) => ({
                px: 1.5,
                py: 1.5,
                borderRadius: 3,
                border: "1px solid",
                borderColor: "divider",
                backgroundColor: alpha(
                  theme.palette.background.default,
                  0.34,
                ),
                flexDirection: "column",
                alignItems: "flex-start",
              })}
            >
              <ListItemText
                primary={formatPastState(ps.state)}
                secondary={`${ps.created.toLocaleString()}${ps.notes ? " — " + ps.notes : ""}`}
                slotProps={{
                  primary: { sx: { color: "text.primary" } },
                  secondary: { sx: { color: "text.secondary" } },
                }}
              />
            </ListItem>
          ))}
        </List>
      </Collapse>
    </Box>
  );
}
