import { useParams } from "react-router-dom";
import { Box, CircularProgress, Container, Typography, alpha, Divider } from "@mui/material";
import { formatValue } from "../util/format";
import { fetchPiece } from "../util/api";
import { useAsync } from "../util/useAsync";
import { type PieceDetail } from "../util/types";
import { formatWorkflowFieldLabel } from "../util/workflow";
import ErrorBoundary from "./ErrorBoundary";
import CloudinaryImage from "./CloudinaryImage";
import ProcessSummary from "./ProcessSummary";

export default function PublicPieceShell() {
  const { id } = useParams<{ id: string }>();
  const { data: piece, loading, error } = useAsync<PieceDetail>(() => fetchPiece(id!), [id]);

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
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {!!error && <Typography color="error">Failed to load piece.</Typography>}
        {piece && <ShowcaseView piece={piece} />}
      </ErrorBoundary>
    </Container>
  );
}

function ShowcaseView({ piece }: { piece: PieceDetail }) {
  const showcaseFields = piece.showcase_fields ?? [];
  const resolvedFields = showcaseFields.map(ref => {
    const [stateId, fieldName] = ref.split(".", 2);
    const state = [...piece.history].reverse().find(s => s.state === stateId);
    const rawValue = state?.custom_fields?.[fieldName];
    const value = formatValue(rawValue);
    return {
        label: formatWorkflowFieldLabel(fieldName),
        value,
    };
  }).filter(f => !!f.value);

  return (
    <Box sx={{ mx: "auto", maxWidth: 800, mt: 4 }}>
      <Box
        sx={(theme) => ({
          position: "relative",
          overflow: "hidden",
          borderRadius: "12px",
          minHeight: { xs: 300, sm: 400 },
          backgroundColor: alpha(theme.palette.background.paper, 0.46),
          boxShadow: `0 24px 60px ${alpha(theme.palette.common.black, 0.14)}`,
          mb: 4,
        })}
      >
        {piece.thumbnail ? (
          <CloudinaryImage
            url={piece.thumbnail.url}
            cloud_name={piece.thumbnail.cloud_name}
            cloudinary_public_id={piece.thumbnail.cloudinary_public_id}
            crop={piece.thumbnail.crop}
            alt={piece.name}
            context="detail"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : null}
      </Box>

      <Typography variant="h3" component="h1" gutterBottom sx={{ fontWeight: 700, letterSpacing: "-0.03em" }}>
        {piece.name}
      </Typography>

      {piece.showcase_story && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", color: "text.secondary", fontSize: "1.1rem", lineHeight: 1.6 }}>
            {piece.showcase_story}
          </Typography>
        </Box>
      )}

      {resolvedFields.length > 0 && (
        <Box sx={{ mb: 6 }}>
            <Typography variant="subtitle2" sx={{ mb: 2, color: "text.secondary", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Details
            </Typography>
            <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                {resolvedFields.map(field => (
                    <Box key={field.label} sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.5 }}>
                        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>{field.label}</Typography>
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>{field.value}</Typography>
                    </Box>
                ))}
            </Box>
        </Box>
      )}

      <Divider sx={{ my: 6, opacity: 0.5 }} />

      <Typography variant="subtitle2" sx={{ mb: 2, color: "text.secondary", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Process Summary
      </Typography>
      <ProcessSummary history={piece.history} />
    </Box>
  );
}


