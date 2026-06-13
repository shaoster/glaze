import { useId, useState, type ReactNode } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { Box, IconButton, Modal, Typography } from "@mui/material";

export interface LargePage {
  title: string;
  body: string;
  bullets?: string[];
}

export interface LargeTutorialInlayProps {
  eyebrow?: string;
  completeLabel?: string;
  pages: LargePage[];
  onComplete: (opts: { dontShow: boolean }) => void;
  onClose: (opts: { dontShow: boolean }) => void;
}

function renderTitle(title: string): ReactNode {
  const parts = title.split(/(<em>.*?<\/em>)/g);
  return parts.map((part, i) => {
    if (!part) return null;
    const match = /^<em>(.*?)<\/em>$/.exec(part);
    if (match) {
      return (
        <Box
          key={i}
          component="span"
          sx={{ fontStyle: "italic", color: "text.secondary" }}
        >
          {match[1]}
        </Box>
      );
    }
    return part;
  });
}

export default function LargeTutorialInlay({
  eyebrow = "Welcome to PotterDoc · Quick tour",
  completeLabel = "Start using PotterDoc",
  pages,
  onComplete,
  onClose,
}: LargeTutorialInlayProps) {
  const titleId = useId();
  const [page, setPage] = useState(0);
  const [dontShow, setDontShow] = useState(false);

  const total = pages.length;
  const currentPage = pages[page];
  const isLastPage = page === total - 1;

  return (
    <Modal open disableAutoFocus aria-labelledby={titleId}>
      {/* Backdrop Box */}
      <Box
        sx={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 70% at 50% 40%, oklch(0 0 0 / 0.35), oklch(0 0 0 / 0.62))",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          display: "grid",
          placeItems: "center",
          padding: "32px",
        }}
      >
        {/* Card Box */}
        <Box
          sx={{
            width: "min(840px, 100%)",
            maxHeight: "100%",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "24px",
            boxShadow:
              "0 32px 64px oklch(0 0 0 / 0.55), 0 8px 16px oklch(0 0 0 / 0.25), 0 1px 0 oklch(1 0 0 / 0.06) inset",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 22px",
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            {/* Eyebrow */}
            <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                  boxShadow: "0 0 0 3px rgba(201,122,77,0.18)",
                  flexShrink: 0,
                }}
              />
              <Typography
                sx={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.16em",
                  color: "text.secondary",
                }}
              >
                {eyebrow}
              </Typography>
            </Box>
            {/* Close button */}
            <IconButton
              aria-label="Close tutorial"
              onClick={() => onClose({ dontShow })}
              sx={{
                width: 32,
                height: 32,
                color: "text.secondary",
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Body: 2-col grid */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1.05fr 1fr",
              flex: 1,
              minHeight: 0,
            }}
          >
            {/* Left panel — illustration */}
            <Box
              sx={{
                bgcolor: "background.default",
                borderRight: "1px solid",
                borderColor: "divider",
                minHeight: 320,
                overflow: "hidden",
                display: "grid",
                placeItems: "center",
                position: "relative",
                background:
                  "radial-gradient(circle at 32% 38%, rgba(201,122,77,0.18), transparent 60%), repeating-linear-gradient(35deg, oklch(0.36 0.012 55), oklch(0.36 0.012 55) 22px, oklch(0.30 0.012 55) 22px, oklch(0.30 0.012 55) 44px)",
              }}
            >
              {/* Pot shape */}
              <Box
                aria-hidden="true"
                sx={{
                  width: 168,
                  height: 168,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle at 32% 28%, oklch(0.78 0.10 45), oklch(0.50 0.10 40) 60%, oklch(0.32 0.08 40) 100%)",
                  boxShadow:
                    "0 0 0 8px oklch(0 0 0 / 0.25), 0 30px 60px oklch(0 0 0 / 0.5), inset -10px -14px 30px oklch(0 0 0 / 0.35), inset 6px 10px 18px oklch(1 0 0 / 0.10)",
                }}
              />
            </Box>

            {/* Right panel — copy */}
            <Box
              sx={{
                padding: "32px 36px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                overflow: "auto",
              }}
            >
              {/* Step counter */}
              <Typography
                sx={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "11px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "text.disabled",
                }}
              >
                {String(page + 1).padStart(2, "0")} /{" "}
                {String(total).padStart(2, "0")}
              </Typography>

              {/* Title */}
              <Typography
                id={titleId}
                variant="h2"
                sx={{
                  fontFamily: "'Instrument Serif', serif",
                  fontSize: "36px",
                  lineHeight: 1.05,
                  fontWeight: 400,
                  textWrap: "balance",
                }}
              >
                {renderTitle(currentPage.title)}
              </Typography>

              {/* Body */}
              <Typography
                sx={{
                  fontSize: "14px",
                  lineHeight: 1.55,
                  color: "text.secondary",
                  maxWidth: "38ch",
                }}
              >
                {currentPage.body}
              </Typography>

              {/* Bullets */}
              {currentPage.bullets && currentPage.bullets.length > 0 && (
                <Box
                  component="ul"
                  sx={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  {currentPage.bullets.map((bullet, i) => (
                    <Box
                      key={i}
                      component="li"
                      sx={{ display: "flex", gap: "12px" }}
                    >
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          bgcolor: "primary.main",
                          flexShrink: 0,
                          mt: "7px",
                        }}
                      />
                      <Typography sx={{ fontSize: "13px" }}>
                        {bullet}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>

          {/* Footer */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              gap: "16px",
              padding: "16px 22px",
              borderTop: "1px solid",
              borderColor: "divider",
              background:
                "linear-gradient(180deg, transparent 0%, oklch(0 0 0 / 0.08) 100%)",
            }}
          >
            {/* Left: Don't show again */}
            <Box
              component="label"
              sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
                fontSize: "12.5px",
                color: "text.secondary",
              }}
            >
              <input
                type="checkbox"
                checked={dontShow}
                onChange={(e) => setDontShow(e.target.checked)}
                aria-label="Don't show this again"
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: "hidden",
                  clip: "rect(0,0,0,0)",
                  whiteSpace: "nowrap",
                  border: 0,
                }}
              />
              {/* Custom checkbox */}
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: "4px",
                  border: "1.5px solid",
                  borderColor: dontShow ? "primary.main" : "divider",
                  bgcolor: dontShow
                    ? "rgba(201,122,77,0.18)"
                    : "background.default",
                  display: "grid",
                  placeItems: "center",
                  color: "primary.main",
                  flexShrink: 0,
                }}
              >
                {dontShow && (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    aria-hidden="true"
                  >
                    <polyline
                      points="1.5,5.5 4,8 8.5,2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </Box>
              Don&apos;t show this again
            </Box>

            {/* Center: Pagination dots */}
            <Box
              sx={{ display: "flex", flexDirection: "row", gap: "6px", alignItems: "center" }}
            >
              {pages.map((_, i) => {
                const isCurrent = i === page;
                const isDone = i < page;
                return (
                  <Box
                    key={i}
                    sx={{
                      width: isCurrent ? "22px" : "6px",
                      height: "6px",
                      borderRadius: isCurrent ? "999px" : "50%",
                      bgcolor: isCurrent
                        ? "primary.main"
                        : isDone
                          ? "text.disabled"
                          : "divider",
                      transition: "all 0.14s ease",
                    }}
                  />
                );
              })}
            </Box>

            {/* Right: Navigation buttons */}
            <Box
              sx={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
              }}
            >
              {page > 0 && (
                <Box
                  component="button"
                  onClick={() => setPage(page - 1)}
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "999px",
                    px: "14px",
                    py: "8px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "text.secondary",
                    bgcolor: "transparent",
                    cursor: "pointer",
                  }}
                >
                  Back
                </Box>
              )}
              <Box
                component="button"
                onClick={() => {
                  if (isLastPage) {
                    onComplete({ dontShow });
                  } else {
                    setPage(page + 1);
                  }
                }}
                sx={{
                  bgcolor: "primary.main",
                  color: "#fff",
                  borderRadius: "999px",
                  px: "14px",
                  py: "8px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                {isLastPage ? (
                  completeLabel
                ) : (
                  <>
                    Next
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      aria-hidden="true"
                    >
                      <path
                        d="M2.5 6h7M6.5 3l3 3-3 3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  </>
                )}
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Modal>
  );
}
