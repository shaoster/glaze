# Glaze — Agent Guide

## Project Overview

Glaze is a pottery workflow tracking application. Users log each pottery piece and record state transitions as the piece moves through the production lifecycle — from throwing or handbuilding through firing, glazing, and finishing. The history of state transitions is the primary data product; it can be analyzed per-piece or in aggregate.

The app has two parts:
- **Backend** (`/backend/`, `/api/`): Django + Django REST Framework, serves JSON to the frontend
- **Frontend** (`/frontend/`): React 19 + TypeScript + Vite + Material UI

---

## Workflow State Machine

The source of truth for piece states is [`workflow.json`](workflow.json) at the project root. Do not hardcode state names or transitions anywhere — always derive them from this file.

**States** (in rough lifecycle order):

| State | Description |
|---|---|
| `wheel_thrown` | Piece created on the wheel (entry point) |
| `handbuilt` | Piece hand-sculpted (entry point) |
| `trimmed` | Wheel-thrown piece trimmed |
| `slip_applied` | Decorative slip added |
| `carved` | Surface carved or decorated |
| `submitted_to_bisque_fire` | Ready for initial firing |
| `bisque_fired` | Initial bisque fire complete |
| `waxed` | Wax resist applied before glazing |
| `glazed` | Glaze applied |
| `submitted_to_glaze_fire` | Ready for glaze firing |
| `glaze_fired` | Glaze fire complete |
| `sanded` | Final sanding/finishing |
| `completed` | Terminal — finished piece |
| `recycled` | Terminal — piece discarded or clay reclaimed |

**Rules:**
- Every non-terminal state has `recycled` as a valid successor — a piece can be recycled at any point.
- `completed` and `recycled` are terminal states (`"terminal": true`) — no transitions out.
- During initial development, all states have `"visible": true` and should be shown in the UI. As additional features are added, some states may become hidden and only available for analysis purposes, but are not shown in the UI by default.
- Valid transitions are defined per-state in `workflow.json`; validate against them on both the frontend and backend.

---

## Data Model

These types are defined in [`frontend/src/types.d.ts`](frontend/src/types.d.ts) and mirror what the backend API should produce.

**`PieceSummary`** — used in list views
```ts
{
  id: string;
  name: string;
  created: Date;
  last_modified: Date;
  thumbnail: string;
  current_state: State;   // just the state name
}
```

**`PieceState`** — a single recorded workflow step
```ts
{
  state: State;
  notes: string;
  created: Date;
  last_modified: Date;
  location: Location;     // string for now
  images: [CaptionedImage];
  previous_state?: State;
  next_state?: State;
}
```

**`PieceDetail`** — used in detail views; extends `PieceSummary`
```ts
PieceSummary & {
  current_state: PieceState;  // full state object, not just name
  history: [PieceState];
}
```

**`CaptionedImage`**
```ts
{ url: string; caption: string; created: Date; }
```

---

## Backend

**Stack**: Django 6, Django REST Framework, SQLite (dev), django-cors-headers

**Project layout:**
- [`backend/`](backend/) — Django project settings, root URL config, WSGI/ASGI
- [`api/`](api/) — the single Django app; models, views, serializers all live here
- [`manage.py`](manage.py) — Django management entrypoint

**Conventions:**
- All API endpoints live under the `api` app and are registered in `backend/urls.py`.
- Use DRF serializers for all request/response shaping — no raw `JsonResponse` with hand-built dicts.
- Serializer output must match the TypeScript types in `types.d.ts` exactly (field names, nesting).
- Validate state transitions server-side against `workflow.json` before persisting a new `PieceState`.
- `workflow.json` can be read at startup and cached; do not re-read it per request.
- CORS is installed (`corsheaders`); ensure it is in `MIDDLEWARE` and configured before shipping any cross-origin endpoint.
- The database is SQLite during development; avoid raw SQL.

**API shape to implement** (not yet built):
- `GET /api/pieces/` → list of `PieceSummary`
- `GET /api/pieces/<id>/` → `PieceDetail`
- `POST /api/pieces/` → create a new piece
- `POST /api/pieces/<id>/states/` → record a new state transition

---

## Frontend

**Stack**: React 19, TypeScript (strict), Vite 8, Material UI (MUI) v7, Axios

**Project layout:**
- [`frontend/src/components/`](frontend/src/components/) — UI components
- [`frontend/src/types.d.ts`](frontend/src/types.d.ts) — all shared TypeScript types
- [`frontend/src/App.tsx`](frontend/src/App.tsx) — root component
- [`frontend/src/main.tsx`](frontend/src/main.tsx) — React entry point

**Conventions:**
- Use MUI components for all UI elements — avoid custom CSS except for layout adjustments MUI can't handle.
- Import types from `types.d.ts`; do not redeclare them locally.
- State names and valid transitions come from `workflow.json` via the constants in `types.d.ts` (`STATES`, `SUCCESSORS`) — do not hardcode them in components.
- Use Axios for all HTTP requests to the backend.
- TypeScript strict mode is on; avoid `any`.
- New component files should be `.tsx`, not `.js`.

**Existing components:**
- [`PieceList.tsx`](frontend/src/components/PieceList.tsx) — MUI table displaying a list of `PieceSummary` objects (columns: Thumbnail, Name, State, Created, Last Modified)
- [`BaseState.js`](frontend/src/components/BaseState.js) — placeholder, not yet implemented; convert to `.tsx` when building it out

---

## Development Setup

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver

# Frontend
cd frontend
npm install
npm run dev
```

---

## Key Constraints

- `workflow.json` is the single source of truth for states and transitions. Both backend validation and frontend UI must derive from it — never duplicate the state list.
- The `PieceState` history is append-only; past states should not be edited, only new ones added. Only the `current_state` should be modifiable. Once a piece has transitioned to a new state, past states should be considered sealed, and care should be taken in the backend code to prevent inadvertent edits to these sealed states.
- `PieceDetail.current_state` is the most recent `PieceState` in the history.
- All dates should be stored and transmitted as ISO 8601 strings; the frontend types declare them as `Date` but Axios/JSON deserialization will deliver them as strings — handle accordingly.