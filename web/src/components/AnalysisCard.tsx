import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Box,
  Stack,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

interface AnalysisCardProps {
  title: string;
  description: string;
  to: string;
  summary?: ReactNode;
}

export default function AnalysisCard({
  title,
  description,
  to,
  summary,
}: AnalysisCardProps) {
  return (
    <Card variant="outlined">
      <CardActionArea component={Link} to={to} sx={{ display: "block" }}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack spacing={2}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <Box>
                <Typography variant="h6" component="h2" gutterBottom>
                  {title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {description}
                </Typography>
              </Box>
              <ChevronRightIcon sx={{ color: "text.disabled", mt: 0.5 }} />
            </Box>

            {summary && <Box>{summary}</Box>}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
