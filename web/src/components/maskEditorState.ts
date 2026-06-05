export type ToolName =
  | "prefill"
  | "polygon"
  | "flood"
  | "eraser"
  | "grabcut"
  | "snap";

export type GrabCutHintMode = "rect" | "foreground" | "background";

export type EdgeOperator = "sobel" | "scharr" | "canny";

export type FloodMode = "add" | "subtract";

export type FloodConnectivity = "4" | "8";

export type SnapTarget = "vertex" | "all";

export type AssistStatus = "idle" | "loading" | "error";

export type Rect = { x: number; y: number; w: number; h: number };

export type Point = { x: number; y: number };

export type MaskEditorState = {
  activeTool: ToolName;

  // eraser params
  eraserRadius: number;

  // flood fill params
  floodMode: FloodMode;
  floodTolerance: number;
  floodSampleSize: number;
  floodConnectivity: FloodConnectivity;
  floodContiguous: boolean;
  floodAntiAlias: boolean;

  // polygon params
  polygonVertices: Point[];
  polygonClosed: boolean;        // true = editing mode; click selects rather than adds
  selectedVertex: number | null;
  polygonSimplifyEps: number;
  polygonLiveSnap: boolean;
  polygonSnapRadius: number;

  // grabcut params
  grabcutRect: Rect | null;
  grabcutHintMode: GrabCutHintMode;
  grabcutBrushRadius: number;
  grabcutIterations: number;

  // contour snap params
  snapTarget: SnapTarget;
  snapRadius: number;
  snapEdgeThreshold: number;
  snapEdgeOperator: EdgeOperator;
  snapRejectBelow: boolean;
  snapAcrossDiscontinuities: boolean;

  // undo/redo counts — actual ImageData snapshots live in MaskEditor refs
  undoStack: number;
  redoStack: number;

  // assist operations
  assistStatus: AssistStatus;
  assistError: string | null;
  lastAssistMs: number | null;

  dirty: boolean;
};

export type MaskEditorAction =
  | { type: "hydrate"; hadMask: boolean }
  | { type: "set_tool"; tool: ToolName }
  // eraser
  | { type: "set_eraser_radius"; radius: number }
  // flood
  | { type: "set_flood_mode"; mode: FloodMode }
  | { type: "set_flood_tolerance"; tolerance: number }
  | { type: "set_flood_sample_size"; size: number }
  | { type: "set_flood_connectivity"; connectivity: FloodConnectivity }
  | { type: "set_flood_contiguous"; contiguous: boolean }
  | { type: "set_flood_anti_alias"; antiAlias: boolean }
  // polygon
  | { type: "polygon_vertex_added"; point: Point }
  | { type: "polygon_vertex_moved"; index: number; point: Point }
  | { type: "polygon_vertex_deleted"; index: number }
  | { type: "polygon_vertex_selected"; index: number | null }
  | { type: "set_polygon_simplify_eps"; eps: number }
  | { type: "set_polygon_live_snap"; on: boolean }
  | { type: "set_polygon_snap_radius"; radius: number }
  | { type: "polygon_vertices_set"; vertices: Point[] }
  | { type: "polygon_closed" }
  | { type: "polygon_reopened" }
  | { type: "polygon_state_restored"; vertices: Point[]; closed: boolean }
  // grabcut
  | { type: "set_grabcut_rect"; rect: Rect | null }
  | { type: "set_grabcut_hint_mode"; mode: GrabCutHintMode }
  | { type: "set_grabcut_brush_radius"; radius: number }
  | { type: "set_grabcut_iterations"; iterations: number }
  // snap
  | { type: "set_snap_target"; target: SnapTarget }
  | { type: "set_snap_radius"; radius: number }
  | { type: "set_snap_edge_threshold"; threshold: number }
  | { type: "set_snap_edge_operator"; operator: EdgeOperator }
  | { type: "set_snap_reject_below"; on: boolean }
  | { type: "set_snap_across_discontinuities"; on: boolean }
  // canvas mutations — ImageData lives in component refs, state tracks counts
  | { type: "tool_applied" }
  | { type: "assist_started" }
  | { type: "assist_succeeded"; ms: number }
  | { type: "assist_failed"; error: string }
  | { type: "undo" }
  | { type: "redo" };

const MAX_UNDO = 20;

export const INITIAL_STATE: MaskEditorState = {
  activeTool: "polygon",
  eraserRadius: 16,
  floodMode: "add",
  floodTolerance: 28,
  floodSampleSize: 3,
  floodConnectivity: "4",
  floodContiguous: true,
  floodAntiAlias: false,
  polygonVertices: [],
  polygonClosed: false,
  selectedVertex: null,
  polygonSimplifyEps: 1.4,
  polygonLiveSnap: true,
  polygonSnapRadius: 8,
  grabcutRect: null,
  grabcutHintMode: "rect",
  grabcutBrushRadius: 6,
  grabcutIterations: 5,
  snapTarget: "vertex",
  snapRadius: 22,
  snapEdgeThreshold: 0.42,
  snapEdgeOperator: "sobel",
  snapRejectBelow: true,
  snapAcrossDiscontinuities: false,
  undoStack: 0,
  redoStack: 0,
  assistStatus: "idle",
  assistError: null,
  lastAssistMs: null,
  dirty: false,
};

function pushUndo(state: MaskEditorState): MaskEditorState {
  return {
    ...state,
    undoStack: Math.min(state.undoStack + 1, MAX_UNDO),
    redoStack: 0,
    dirty: true,
  };
}

export function maskEditorReducer(
  state: MaskEditorState,
  action: MaskEditorAction,
): MaskEditorState {
  switch (action.type) {
    case "hydrate":
      return {
        ...INITIAL_STATE,
        undoStack: action.hadMask ? 1 : 0,
      };

    case "set_tool":
      return { ...state, activeTool: action.tool };

    case "set_eraser_radius":
      return { ...state, eraserRadius: action.radius };

    case "set_flood_mode":
      return { ...state, floodMode: action.mode };
    case "set_flood_tolerance":
      return { ...state, floodTolerance: action.tolerance };
    case "set_flood_sample_size":
      return { ...state, floodSampleSize: action.size };
    case "set_flood_connectivity":
      return { ...state, floodConnectivity: action.connectivity };
    case "set_flood_contiguous":
      return { ...state, floodContiguous: action.contiguous };
    case "set_flood_anti_alias":
      return { ...state, floodAntiAlias: action.antiAlias };

    case "polygon_vertex_added":
      return {
        ...state,
        polygonVertices: [...state.polygonVertices, action.point],
        selectedVertex: state.polygonVertices.length,
        dirty: true,
      };
    case "polygon_vertex_moved": {
      const verts = [...state.polygonVertices];
      verts[action.index] = action.point;
      return { ...state, polygonVertices: verts, dirty: true };
    }
    case "polygon_vertex_deleted": {
      const verts = state.polygonVertices.filter((_, i) => i !== action.index);
      return {
        ...state,
        polygonVertices: verts,
        selectedVertex: null,
        dirty: true,
      };
    }
    case "polygon_vertex_selected":
      return { ...state, selectedVertex: action.index };
    case "set_polygon_simplify_eps":
      return { ...state, polygonSimplifyEps: action.eps };
    case "set_polygon_live_snap":
      return { ...state, polygonLiveSnap: action.on };
    case "set_polygon_snap_radius":
      return { ...state, polygonSnapRadius: action.radius };
    case "polygon_vertices_set":
      return { ...state, polygonVertices: action.vertices, polygonClosed: false, selectedVertex: null, dirty: true };
    case "polygon_closed":
      return { ...state, polygonClosed: true };
    case "polygon_reopened":
      return { ...state, polygonClosed: false };
    case "polygon_state_restored":
      return { ...state, polygonVertices: action.vertices, polygonClosed: action.closed, selectedVertex: null, dirty: true };

    case "set_grabcut_rect":
      return { ...state, grabcutRect: action.rect };
    case "set_grabcut_hint_mode":
      return { ...state, grabcutHintMode: action.mode };
    case "set_grabcut_brush_radius":
      return { ...state, grabcutBrushRadius: action.radius };
    case "set_grabcut_iterations":
      return { ...state, grabcutIterations: action.iterations };

    case "set_snap_target":
      return { ...state, snapTarget: action.target };
    case "set_snap_radius":
      return { ...state, snapRadius: action.radius };
    case "set_snap_edge_threshold":
      return { ...state, snapEdgeThreshold: action.threshold };
    case "set_snap_edge_operator":
      return { ...state, snapEdgeOperator: action.operator };
    case "set_snap_reject_below":
      return { ...state, snapRejectBelow: action.on };
    case "set_snap_across_discontinuities":
      return { ...state, snapAcrossDiscontinuities: action.on };

    case "tool_applied":
      return pushUndo(state);

    case "assist_started":
      return { ...state, assistStatus: "loading", assistError: null };
    case "assist_succeeded":
      return {
        ...pushUndo(state),
        assistStatus: "idle",
        lastAssistMs: action.ms,
      };
    case "assist_failed":
      return {
        ...state,
        assistStatus: "error",
        assistError: action.error,
      };

    case "undo": {
      if (state.undoStack === 0) return state;
      return {
        ...state,
        undoStack: state.undoStack - 1,
        redoStack: Math.min(state.redoStack + 1, MAX_UNDO),
      };
    }
    case "redo": {
      if (state.redoStack === 0) return state;
      return {
        ...state,
        undoStack: Math.min(state.undoStack + 1, MAX_UNDO),
        redoStack: state.redoStack - 1,
      };
    }

    default:
      return state;
  }
}
