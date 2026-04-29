import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Collapse,
  List,
  ListItem,
  ListItemText,
  Typography,
} from "@mui/material";
import type { CaptionedImage, PieceState } from "../util/types";
import { formatPastState } from "../util/types";
import CloudinaryImage from "./CloudinaryImage";
import ImageLightbox from "./ImageLightbox";

type PieceHistoryProps = {
  pastHistory: PieceState[];
  currentThumbnailUrl?: string;
  onSetAsThumbnail: (image: CaptionedImage) => Promise<void>;
};

export default function PieceHistory({
  pastHistory,
  currentThumbnailUrl,
  onSetAsThumbnail,
}: PieceHistoryProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const allHistoryImages = useMemo<CaptionedImage[]>(
    () => pastHistory.flatMap((ps) => ps.images),
    [pastHistory],
  );

  if (pastHistory.length === 0) return null;

  return (
    <Box>
      <Button
        variant="text"
        onClick={() => setHistoryOpen((o) => !o)}
        sx={{ mb: 1 }}
      >
        {historyOpen ? "Hide" : "Show"} history ({pastHistory.length} past
        state{pastHistory.length !== 1 ? "s" : ""})
      </Button>
      <Collapse in={historyOpen}>
        <List dense>
          {
            pastHistory.reduce<{ offset: number; items: React.ReactNode[] }>(
              ({ offset, items }, ps, i) => {
                const stateOffset = offset;
                items.push(
                  <ListItem
                    key={i}
                    disableGutters
                    sx={{ flexDirection: "column", alignItems: "flex-start" }}
                  >
                    <ListItemText
                      primary={formatPastState(ps.state)}
                      secondary={`${ps.created.toLocaleString()}${ps.notes ? " — " + ps.notes : ""}`}
                      slotProps={{
                        primary: { sx: { color: "text.primary" } },
                        secondary: { sx: { color: "text.secondary" } },
                      }}
                    />
                    {ps.images.length > 0 && (
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 1,
                          mt: 0.5,
                        }}
                      >
                        {ps.images.map((img, j) => (
                          <Box
                            key={j}
                            component="button"
                            onClick={() => setLightboxIndex(stateOffset + j)}
                            aria-label={`View image ${stateOffset + j + 1}`}
                            sx={{
                              p: 0,
                              border: "none",
                              background: "none",
                              cursor: "pointer",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              maxWidth: 80,
                            }}
                          >
                            <CloudinaryImage
                              url={img.url}
                              cloudinary_public_id={img.cloudinary_public_id}
                              alt={img.caption || ""}
                              context="thumbnail"
                              style={{ objectFit: "cover", borderRadius: 4 }}
                            />
                            {img.caption && (
                              <Typography
                                variant="caption"
                                sx={{
                                  color: "text.secondary",
                                  textAlign: "center",
                                  wordBreak: "break-word",
                                }}
                              >
                                {img.caption}
                              </Typography>
                            )}
                          </Box>
                        ))}
                      </Box>
                    )}
                  </ListItem>,
                );
                return { offset: offset + ps.images.length, items };
              },
              { offset: 0, items: [] },
            ).items
          }
        </List>
      </Collapse>
      {lightboxIndex !== null && (
        <ImageLightbox
          images={allHistoryImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          currentThumbnailUrl={currentThumbnailUrl}
          onSetAsThumbnail={onSetAsThumbnail}
        />
      )}
    </Box>
  );
}
