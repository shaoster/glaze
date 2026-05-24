import { useCallback } from "react";
import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  IconButton,
  Paper,
  Popper,
  Typography,
} from "@mui/material";

import { useAsyncFn } from "../util/useAsync";
import {
  TUTORIAL_TOGGLE_METADATA,
  type TutorialToggleKey,
} from "../util/tutorials";
import {
  useCurrentUser,
  useSaveUserPreferences,
} from "./CurrentUserContext";
import {
  SMALL_TUTORIAL_INLAY_PLACEMENTS,
  SMALL_TUTORIAL_INLAY_LEFT_HORIZONTAL_OFFSET_PX,
  SMALL_TUTORIAL_INLAY_RIGHT_HORIZONTAL_OFFSET_PX,
  SMALL_TUTORIAL_INLAY_RIGHT_POSITIONING,
  SMALL_TUTORIAL_INLAY_TOP_POSITIONING,
  SMALL_TUTORIAL_INLAY_TOP_VERTICAL_OFFSET_PX,
  type SmallTutorialInlayPlacement,
} from "./SmallTutorialInlayConfig";

export interface SmallTutorialInlayProps {
  attachedElement: HTMLElement | null;
  onClick: () => void | Promise<void>;
  tutorialKey: TutorialToggleKey;
  placement: SmallTutorialInlayPlacement;
}

export default function SmallTutorialInlay({
  attachedElement,
  onClick,
  tutorialKey,
  placement,
}: SmallTutorialInlayProps) {
  const currentUser = useCurrentUser();
  const saveUserPreferences = useSaveUserPreferences();
  const copy = TUTORIAL_TOGGLE_METADATA[tutorialKey];
  const tutorialVisibility =
    currentUser?.preferences.tutorials[tutorialKey] ?? true;
  const shouldShow =
    Boolean(attachedElement && currentUser && saveUserPreferences) &&
    tutorialVisibility;
  const popperOffsetByPlacement = {
    [SMALL_TUTORIAL_INLAY_PLACEMENTS.RIGHT]: [
      0,
      SMALL_TUTORIAL_INLAY_RIGHT_HORIZONTAL_OFFSET_PX,
    ],
    [SMALL_TUTORIAL_INLAY_PLACEMENTS.LEFT]: [
      0,
      SMALL_TUTORIAL_INLAY_LEFT_HORIZONTAL_OFFSET_PX,
    ],
    [SMALL_TUTORIAL_INLAY_PLACEMENTS.TOP]: [
      0,
      SMALL_TUTORIAL_INLAY_TOP_VERTICAL_OFFSET_PX,
    ],
  } satisfies Record<SmallTutorialInlayPlacement, [number, number]>;
  const popperOffset = popperOffsetByPlacement[placement];
  const tailBaseStyles = {
    width: SMALL_TUTORIAL_INLAY_RIGHT_POSITIONING.TAIL_PROTRUSION_PX * 2,
    height: SMALL_TUTORIAL_INLAY_RIGHT_POSITIONING.TAIL_PROTRUSION_PX * 2,
    borderBottom: "1px solid",
  };
  const tailSideStyles = {
    ...tailBaseStyles,
    top: "50%",
    transform: "translateY(-50%) rotate(45deg)",
  };
  const tailStylesByPlacement: Record<
    SmallTutorialInlayPlacement,
    Record<string, unknown>
  > = {
    [SMALL_TUTORIAL_INLAY_PLACEMENTS.RIGHT]: {
      ...tailSideStyles,
      left: -SMALL_TUTORIAL_INLAY_RIGHT_POSITIONING.TAIL_PROTRUSION_PX,
      borderLeft: "1px solid",
      boxShadow: "-2px 2px 8px rgba(0, 0, 0, 0.12)",
    },
    [SMALL_TUTORIAL_INLAY_PLACEMENTS.LEFT]: {
      ...tailSideStyles,
      right: -SMALL_TUTORIAL_INLAY_RIGHT_POSITIONING.TAIL_PROTRUSION_PX,
      borderRight: "1px solid",
      boxShadow: "2px 2px 8px rgba(0, 0, 0, 0.12)",
    },
    [SMALL_TUTORIAL_INLAY_PLACEMENTS.TOP]: {
      bottom: -SMALL_TUTORIAL_INLAY_TOP_POSITIONING.TAIL_PROTRUSION_PX,
      left: "50%",
      width: SMALL_TUTORIAL_INLAY_TOP_POSITIONING.TAIL_PROTRUSION_PX * 2,
      height: SMALL_TUTORIAL_INLAY_TOP_POSITIONING.TAIL_PROTRUSION_PX * 2,
      transform: "translateX(-50%) rotate(45deg)",
      borderLeft: "1px solid",
      borderBottom: "1px solid",
      boxShadow: "-2px 2px 8px rgba(0, 0, 0, 0.12)",
    },
  };
  const tailStyles = tailStylesByPlacement[placement];

  const dismissTutorial = useCallback(async () => {
    if (!currentUser || !saveUserPreferences) {
      return;
    }
    await saveUserPreferences({
      ...currentUser.preferences,
      tutorials: {
        ...currentUser.preferences.tutorials,
        [tutorialKey]: false,
      },
    });
  }, [currentUser, saveUserPreferences, tutorialKey]);

  const openTutorial = useCallback(async () => {
    await dismissTutorial();
    await onClick();
  }, [dismissTutorial, onClick]);

  const openState = useAsyncFn(openTutorial, [openTutorial]);
  const dismissState = useAsyncFn(dismissTutorial, [dismissTutorial]);

  if (!shouldShow) {
    return null;
  }

  return (
    <Popper
      open
      anchorEl={attachedElement}
      placement={placement}
      modifiers={[
        {
          name: "offset",
          options: { offset: popperOffset },
        },
      ]}
      sx={{ zIndex: "auto" }}
    >
      <Paper
        variant="outlined"
        role="button"
        tabIndex={0}
        aria-label={copy.label}
        onClick={() => void openState.execute()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            void openState.execute();
          }
        }}
        sx={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          py: 0.8,
          px: 1.25,
          borderRadius: 2,
          borderColor: "primary.light",
          bgcolor: "rgba(201, 122, 77, 0.24)",
          backgroundImage:
            "linear-gradient(135deg, rgba(201,122,77,0.34) 0%, rgba(15,11,10,0.12) 100%)",
          boxShadow: "0 12px 28px rgba(0, 0, 0, 0.24)",
          cursor: "pointer",
          userSelect: "none",
          overflow: "visible",
          animation:
            "smallTutorialInlayBounce 5.2s cubic-bezier(0.45, 0, 0.55, 1) infinite",
          willChange: "transform",
          "@media (prefers-reduced-motion: reduce)": {
            animation: "none",
          },
          "@keyframes smallTutorialInlayBounce": {
            "0%, 80%, 100%": {
              transform: "translate3d(0, 0, 0)",
            },
            "88%": {
              transform: "translate3d(0, -1.5px, 0)",
            },
            "92%": {
              transform: "translate3d(0, 0, 0)",
            },
          },
          "&::before": {
            content: '""',
            position: "absolute",
            ...tailStyles,
            bgcolor: "rgba(201, 122, 77, 0.24)",
            backgroundImage:
              "linear-gradient(135deg, rgba(201,122,77,0.34) 0%, rgba(15,11,10,0.12) 100%)",
            borderColor: "primary.light",
          },
        }}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            flexShrink: 0,
            bgcolor: "warning.main",
            boxShadow: "0 0 10px rgba(201, 122, 77, 0.55)",
          }}
        />
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {copy.label}
        </Typography>
        <IconButton
          size="small"
          aria-label={copy.dismissLabel}
          onClick={(event) => {
            event.stopPropagation();
            void dismissState.execute();
          }}
          disabled={openState.loading || dismissState.loading}
          sx={{ ml: "auto" }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Paper>
    </Popper>
  );
}
