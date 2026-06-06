import { useParams, Link as RouterLink } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Typography,
  alpha,
  Divider,
} from "@mui/material";
import { useSuspenseQuery } from "@tanstack/react-query";
import { fetchPiece } from "../util/api";
import { type PieceDetail } from "../util/types";
import CloudinaryImage from "./CloudinaryImage";
import ProcessSummary from "./ProcessSummary";

export function ShowcasePage({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const { data: piece } = useSuspenseQuery<PieceDetail>({
    queryKey: ["piece", id],
    queryFn: () => fetchPiece(id!),
  });

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
      <ShowcaseHeader piece={piece} isAuthenticated={isAuthenticated} />
      <ShowcaseView piece={piece} isAuthenticated={isAuthenticated} />
    </Container>
  );
}

export default ShowcasePage;

function ShowcaseHeader({ piece, isAuthenticated }: { piece: PieceDetail; isAuthenticated: boolean }) {
  const { id } = useParams<{ id: string }>();

  if (isAuthenticated && piece.can_edit) {
    // Owner
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box component="img" src="/favicon.svg" alt="PotterDoc" sx={{ width: 22, height: 22 }} />
          <Typography variant="h6" component="p">PotterDoc</Typography>
        </Box>
        <Button component={RouterLink} to={`/pieces/${id}`} variant="outlined" size="small">
          Edit
        </Button>
      </Box>
    );
  }

  if (isAuthenticated && !piece.can_edit) {
    // Authenticated non-owner
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box component="img" src="/favicon.svg" alt="PotterDoc" sx={{ width: 22, height: 22 }} />
          <Typography variant="h6" component="p">PotterDoc</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {piece.owner_alias ? `Viewing ${piece.owner_alias}'s piece` : "Viewing a shared piece"}
          </Typography>
          <Button component={RouterLink} to="/" variant="text" size="small">
            My pieces
          </Button>
        </Box>
      </Box>
    );
  }

  // Unauthenticated visitor
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
      <Box component={RouterLink} to="/" sx={{ display: "flex", alignItems: "center", gap: 1, textDecoration: "none", color: "inherit" }}>
        <Box component="img" src="/favicon.svg" alt="PotterDoc" sx={{ width: 22, height: 22 }} />
        <Typography variant="h6" component="p">PotterDoc</Typography>
      </Box>
      <Button
        component={RouterLink}
        to={`/?next=/pieces/${id}/showcase`}
        variant="outlined"
        size="small"
      >
        Log in
      </Button>
    </Box>
  );
}

function ShowcaseView({ piece }: { piece: PieceDetail; isAuthenticated: boolean }) {
  return (
    <Box sx={{ mx: "auto", maxWidth: 800, mt: 4 }}>
      {piece.showcase_video_url && (
        <Box
          component="video"
          src={piece.showcase_video_url}
          controls
          playsInline
          sx={{ width: "100%", borderRadius: 1, display: "block", backgroundColor: "black", mb: 3 }}
        />
      )}

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

      <Typography
        variant="h3"
        component="h1"
        gutterBottom
        sx={{ fontWeight: 700, letterSpacing: "-0.03em" }}
      >
        {piece.name}
      </Typography>

      {piece.showcase_story && (
        <Box sx={{ mb: 4 }}>
          <Typography
            variant="body1"
            sx={{
              whiteSpace: "pre-wrap",
              color: "text.secondary",
              fontSize: "1.1rem",
              lineHeight: 1.6,
            }}
          >
            {piece.showcase_story}
          </Typography>
        </Box>
      )}

      <Divider sx={{ my: 6, opacity: 0.5 }} />

      <Typography
        variant="subtitle2"
        sx={{
          mb: 2,
          color: "text.secondary",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Process Summary
      </Typography>
      <ProcessSummary piece={piece} history={piece.history} />
    </Box>
  );
}
