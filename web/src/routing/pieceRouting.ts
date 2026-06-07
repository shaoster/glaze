/**
 * Routing hooks for /pieces/:id sub-routes.
 *
 * Each hook returns a typed props object. Route-aware parents call the hook
 * and spread/inject the result into the child component so the child itself
 * has no URL dependencies and tests stay clean.
 */
import { useLocation, useNavigate } from "react-router-dom";

// ── History (/pieces/:id/history/:stateId) ────────────────────────────────────

export interface PieceHistoryRouting {
  rewindedStateId: string | null;
  onRewind: (stateId: string) => void;
  onClearRewind: () => void;
}

export function usePieceHistoryRouting(pieceId: string): PieceHistoryRouting {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const match = pathname.match(/\/history\/([^/]+)$/);
  return {
    rewindedStateId: match?.[1] ?? null,
    onRewind: (stateId) => navigate(`/pieces/${pieceId}/history/${stateId}`),
    onClearRewind: () => navigate(`/pieces/${pieceId}`),
  };
}

// ── Video (/pieces/:id/video) ─────────────────────────────────────────────────

export interface PieceVideoRouting {
  atVideo: boolean;
  onVideoNavigate: (open: boolean) => void;
}

export function usePieceVideoRouting(pieceId: string): PieceVideoRouting {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return {
    atVideo: pathname.endsWith("/video"),
    onVideoNavigate: (open) =>
      navigate(open ? `/pieces/${pieceId}/video` : `/pieces/${pieceId}`),
  };
}

// ── Tags (/pieces/:id/tags/new) ───────────────────────────────────────────────

export interface PieceTagsRouting {
  tagDialogOpen: boolean;
  onOpenTagDialog: () => void;
  onCloseTagDialog: () => void;
}

export function usePieceTagsRouting(pieceId: string): PieceTagsRouting {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return {
    tagDialogOpen: pathname.endsWith("/tags/new"),
    onOpenTagDialog: () => navigate(`/pieces/${pieceId}/tags/new`),
    onCloseTagDialog: () => navigate(`/pieces/${pieceId}`),
  };
}

// ── Global fields (/pieces/:id/state/fields/:fieldName[/new]) ─────────────────
//
// fieldName is the workflow field key (e.g. "current_location"), which may
// differ from globalName (the underlying global type, e.g. "location") when
// multiple fields on the same state reference the same global type.

export interface GlobalFieldRouting {
  open: boolean;
  tab: "browse" | "create";
  onOpen: () => void;
  onClose: () => void;
  onTabChange: (tab: "browse" | "create") => void;
}

export function useGlobalFieldRouting(
  pieceId: string,
  fieldName: string,
): GlobalFieldRouting {
  const navigate = useNavigate();
  const location = useLocation();
  const match = location.pathname.match(/\/state\/fields\/([^/]+)(\/new)?$/);
  const tab: "browse" | "create" = match?.[2] === "/new" ? "create" : "browse";
  return {
    open: match?.[1] === fieldName,
    tab,
    onOpen: () =>
      navigate(`/pieces/${pieceId}/state/fields/${fieldName}`, {
        state: location.state,
      }),
    onClose: () =>
      navigate(`/pieces/${pieceId}`, { state: location.state }),
    onTabChange: (newTab) =>
      navigate(
        newTab === "create"
          ? `/pieces/${pieceId}/state/fields/${fieldName}/new`
          : `/pieces/${pieceId}/state/fields/${fieldName}`,
        { state: location.state },
      ),
  };
}
