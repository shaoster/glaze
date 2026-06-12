import {
  Box,
  Checkbox,
  Tooltip,
  Typography,
} from "@mui/material";
import AppImage from "./AppImage";

export type SelectablePhotoItem = {
  key: string;
  url: string;
  stateLabel: string;
  whenLabel: string;
  cropped_url?: string | null;
  crop?: { x: number; y: number; width: number; height: number } | null;
  checked: boolean;
  locked?: boolean;
  onToggle?: () => void;
};

type SelectablePhotoMasonryProps = {
  items: SelectablePhotoItem[];
  emptyLabel: string;
  disabled?: boolean;
};

export default function SelectablePhotoMasonry({
  items,
  emptyLabel,
  disabled = false,
}: SelectablePhotoMasonryProps) {
  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {emptyLabel}
      </Typography>
    );
  }

  const MasonryTile = ({ data: item }: { data: SelectablePhotoItem }) => {
    return (
      <Box
        sx={{
          position: "relative",
          border: "1px solid",
          borderColor: item.checked ? "primary.main" : "divider",
          borderRadius: 2,
          overflow: "hidden",
          bgcolor: item.checked ? "action.hover" : "background.paper",
        }}
      >
        <Box sx={{ position: "relative" }}>
          <AppImage
            url={item.url}
            croppedUrl={item.cropped_url}
            crop={item.crop}
            alt={item.stateLabel || "Piece photo"}
            context="gallery"
            style={{
              width: "100%",
              height: "auto",
              objectFit: "contain",
              display: "block",
            }}
          />
          {/* Top-left: cover badge for locked items */}
          {item.locked ? (
            <Box
              sx={{
                position: "absolute",
                top: 8,
                left: 8,
                px: 1,
                py: 0.25,
                borderRadius: 999,
                bgcolor: "rgba(0,0,0,0.72)",
                color: "common.white",
                fontSize: 11,
                lineHeight: 1.4,
              }}
            >
              Cover
            </Box>
          ) : null}
          {/* Top-right: checkbox */}
          <Box sx={{ position: "absolute", top: 4, right: 4, zIndex: 1 }}>
            <Tooltip title={item.locked ? "Cannot exclude the video cover" : ""}>
              <span>
                <Checkbox
                  checked={item.checked}
                  onChange={item.locked ? undefined : item.onToggle}
                  disabled={disabled || item.locked}
                  size="small"
                  sx={{
                    p: 0.5,
                    bgcolor: "rgba(255,255,255,0.85)",
                    borderRadius: 1,
                    "&:hover": { bgcolor: "rgba(255,255,255,0.95)" },
                  }}
                  inputProps={{
                    "aria-label": `${item.locked ? "Locked cover" : "Include in the video"}: ${item.stateLabel}`,
                  }}
                />
              </span>
            </Tooltip>
          </Box>
          {/* Bottom-left: state + date chip */}
          <Box
            sx={{
              position: "absolute",
              left: 8,
              right: 8,
              bottom: 8,
              display: "flex",
              flexDirection: "column",
              pointerEvents: "none",
            }}
          >
            <Box
              sx={{
                alignSelf: "flex-start",
                px: 1,
                py: 0.25,
                borderRadius: 999,
                bgcolor: "rgba(0,0,0,0.72)",
                color: "common.white",
                fontSize: 11,
                lineHeight: 1.4,
              }}
            >
              {item.stateLabel} · {item.whenLabel}
            </Box>
          </Box>
        </Box>
      </Box>
    );
  };

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: "100%",
        overflowX: "clip",
        columnCount: { xs: 2, sm: 3, md: 4, lg: 5 },
        columnGap: 1,
      }}
    >
      {items.map((item) => (
        <Box
          key={item.key}
          sx={{
            breakInside: "avoid",
            mb: 1,
            width: "100%",
            maxWidth: "100%",
            display: "inline-block",
          }}
        >
          <MasonryTile data={item} />
        </Box>
      ))}
    </Box>
  );
}
