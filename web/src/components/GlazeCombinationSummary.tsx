import { Box, Typography, alpha } from "@mui/material";
import { useSuspenseQuery } from "@tanstack/react-query";
import { fetchGlazeCombinationImages } from "../util/api";
import CloudinaryImage from "./CloudinaryImage";
import type { GlazeCombinationImageEntry } from "../util/types";
import { GLAZE_COMBINATION_IMAGES_QUERY_KEY } from "../util/queryKeys";

export default function GlazeCombinationSummary() {
  const { data } = useSuspenseQuery<GlazeCombinationImageEntry[]>({
    queryKey: GLAZE_COMBINATION_IMAGES_QUERY_KEY,
    queryFn: fetchGlazeCombinationImages,
  });

  const combinationCount = data.length;
  // Get up to 4 representative images from different combinations
  const representativeImages = data
    .flatMap((entry) => entry.pieces.flatMap((p) => p.images))
    .slice(0, 4);

  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mb: 1, display: "block" }}
      >
        {combinationCount} combination{combinationCount === 1 ? "" : "s"} with
        images
      </Typography>
      <Box sx={{ display: "flex", gap: 0.5 }}>
        {representativeImages.map((img, idx) => (
          <Box
            key={idx}
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1,
              overflow: "hidden",
              bgcolor: alpha("#000", 0.1),
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <CloudinaryImage
              url={img.url}
              cloud_name={img.cloud_name}
              cloudinary_public_id={img.cloudinary_public_id}
              alt=""
              context="thumbnail"
            />
          </Box>
        ))}
        {combinationCount > 4 && (
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: alpha("#000", 0.05),
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              fontWeight="bold"
            >
              +{combinationCount - 4}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
