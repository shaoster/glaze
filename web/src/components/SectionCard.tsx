import type { Ref, ReactNode } from "react";
import { alpha, Box, Typography } from "@mui/material";

type SectionCardProps = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  titleId?: string;
  titleRef?: Ref<HTMLHeadingElement>;
  titleAdornment?: ReactNode;
  children: ReactNode;
};

/**
 * Frosted-glass card with an optional eyebrow label, heading, subtitle, and
 * adornment slot. Used throughout PieceDetail to visually group related fields.
 */
export default function SectionCard({
  eyebrow,
  title,
  subtitle,
  titleId,
  titleRef,
  titleAdornment,
  children,
}: SectionCardProps) {
  return (
    <Box
      sx={(theme) => ({
        borderRadius: "6px",
        border: "1px solid",
        borderColor: "divider",
        backgroundColor: alpha(theme.palette.background.paper, 0.66),
        backdropFilter: "blur(14px)",
        boxShadow: `0 14px 34px ${alpha(theme.palette.common.black, 0.14)}`,
        overflow: "hidden",
      })}
    >
      <Box sx={{ px: { xs: 1.5, sm: 2 }, pt: 1.25, pb: 0.75 }}>
        {(eyebrow || title || subtitle) && (
          <>
            {eyebrow && (
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  mb: 0.25,
                  color: "text.secondary",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                {eyebrow}
              </Typography>
            )}
            {(title || subtitle) && (
                <Box
                  sx={{
                    display: "flex",
                    gap: 1.5,
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                  }}
                >
                {title ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography
                      variant="h6"
                      component="h3"
                      id={titleId}
                      ref={titleRef}
                    >
                      {title}
                    </Typography>
                    {titleAdornment ? (
                      <Box sx={{ ml: 0.5, display: "flex", alignItems: "center" }}>
                        {titleAdornment}
                      </Box>
                    ) : null}
                  </Box>
                ) : (
                  <Box />
                )}
                {subtitle && (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {subtitle}
                  </Typography>
                )}
              </Box>
            )}
          </>
        )}
      </Box>
      <Box sx={{ px: { xs: 1.5, sm: 2 }, pb: 1.5 }}>{children}</Box>
    </Box>
  );
}
