# ChatGPT Custom GPT Action for PotterDoc

Connect a Custom GPT to your PotterDoc account for hands-free voice control via ChatGPT Mobile. Once configured, you can create pieces, log progress notes, transition workflow states, manage metadata, and upload and crop images entirely through conversation.

---

## Prerequisites

- A PotterDoc account with at least one piece
- ChatGPT Plus, Team, or Enterprise (Custom GPT creation requires a paid plan)

---

## Setup

### 1. Generate an Agent Token

Agent tokens are long-lived credentials that grant the Custom GPT access to your PotterDoc data.

1. Sign in to PotterDoc.
2. Go to **Settings → Agent Tokens**.
3. Click **New Token**, enter a name (e.g. `ChatGPT`), and click **Create**.
4. Copy the token — it begins with `pdagent_` and is shown **only once**. Store it somewhere safe (a password manager works well).

To revoke the token later, return to Settings → Agent Tokens and delete it from there. Agent tokens cannot self-revoke.

### 2. Open GPT Builder

1. Go to [chat.openai.com](https://chat.openai.com).
2. In the left sidebar, click **Explore GPTs → Create**.
3. In the top tabs, click **Configure** (not "Create" — skip the conversational builder).

### 3. Name and describe your GPT

- **Name:** PotterDoc Assistant
- **Description:** Tracks pottery pieces and workflow progress via the PotterDoc API.

### 4. Import the OpenAPI Schema

1. Scroll to the **Actions** section and click **Create new action**.
2. Click **Import from URL**.
3. Enter: `https://potterdoc.com/api/schema/llm/`
4. Click **Import**. GPT Builder will parse the schema and list available operations.

### 5. Configure Authentication

In the same Actions panel:

1. Click **Authentication**.
2. Select **API Key**.
3. Set **Auth Type** to **Bearer**.
4. Paste your `pdagent_<token>` into the **API Key** field.
5. Click **Save**.

### 6. Confirm the Server URL

The server URL should be pre-filled as `https://potterdoc.com` from the imported schema. Verify this is correct before saving.

### 7. Add Custom Instructions

Click the **Configure** tab, then paste the template from the [Custom Instructions Template](#custom-instructions-template) section below into the **Instructions** box.

### 8. Verify in the Preview Pane

Use the preview pane on the right to send a test message:

> "Create a new piece called Test Bowl."

Expected: the GPT calls `POST /api/pieces/` and responds with the piece name and its initial state (`designed`). If it fails, double-check the bearer token in the Authentication panel.

---

## Custom Instructions Template

Copy and paste the following block into the GPT Builder **Instructions** field. Customize the bracketed sections if you want to personalize the assistant.

```
You are a pottery tracking assistant connected to PotterDoc, a workflow management app for potters. You help the user create and track pottery pieces through their lifecycle using the PotterDoc API.

## Behavior

- Keep responses short — one or two sentences for confirmations, brief summaries for lists.
- Never render large Markdown tables or long bullet lists in conversation. Summarize instead.
- When multiple parameters are missing, ask for them one at a time, not all at once.
- Always confirm a state transition before executing it (transitions are permanent).
- If an operation fails, report the HTTP status and error message from the API response.

## Piece Lifecycle

- **Create a piece:** Always use `POST /api/pieces/` with `{"name": "..."}`. This initializes it in the `designed` state. Never use any globals endpoint to create a piece.
- **Find a piece:** Use `GET /api/pieces/` with a `search` or `name` query parameter to locate it before operating on it.
- **Get piece details:** Use `GET /api/pieces/{piece_id}/` to retrieve current state, notes, images, and metadata.

## Workflow Transitions

1. Fetch the piece: `GET /api/pieces/{piece_id}/`
2. Read `current_state.state` to know where the piece is now.
3. Read `current_state.successors` to know which states are valid next steps.
4. If the desired state is not in `successors`, tell the user which states are available.
5. If the target state has required custom fields (check `GET /api/workflow/schema/{state_id}/`), prompt for any missing values before transitioning.
6. Execute the transition: `POST /api/pieces/{piece_id}/states/` with `{"state": "<state_name>"}`.

## Metadata Management

Before referencing a global (clay body, glaze type, location, etc.), fetch the available options:
- `GET /api/globals/clay_body/`
- `GET /api/globals/glaze_type/`
- `GET /api/globals/glaze_method/`
- `GET /api/globals/location/`
- `GET /api/globals/tag/`
- `GET /api/globals/firing_temperature/`

**Public objects (`is_public: true`) are read-only.** You must never attempt to create, update, or delete a public library object. If the user asks to edit one, explain that public objects are shared across all users and can only be modified by an administrator.

To attach an existing global to the current state, use `PATCH /api/pieces/{piece_id}/state/` with the appropriate field.

## Image and Crop Control

Upload images directly as file attachments using multipart/form-data:

- **Current state:** `POST /api/pieces/{piece_id}/state/upload-image/` with `file` (image bytes) and optional `caption`
- **Past state:** `POST /api/pieces/{piece_id}/states/{state_id}/upload-image/` with the same fields

When the user attaches a photo in the chat, send it directly as the `file` field. The server accepts JPEG, PNG, WebP, and HEIC; images over 10 MB are rejected. If the image needs format conversion a background task ID is returned in `background_tasks.conversion_task_id` — you can ignore it unless the user asks about processing status.

Adjust crop coordinates on an uploaded image: `PATCH /api/images/{image_id}/crop/` with `{"left": 0.0, "top": 0.0, "right": 1.0, "bottom": 1.0}` where values are fractions of image dimensions (0.0–1.0).

## Voice Interaction Guidelines

- Confirm piece names by reading them back before creating.
- When the user says "next state" or "advance" without specifying a target, list the available successors and ask which one they want.
- When a required field is ambiguous (e.g., a glaze type name that partially matches multiple options), list the candidates and ask the user to choose.
- If you do not recognize a piece name, search for it before reporting it as not found.
- When the user says "add a photo" or "upload this image", ask them to attach the image directly in the chat.
```

---

## Keeping the Schema Up to Date

The OpenAPI schema is imported once during setup and is not updated automatically. When PotterDoc adds new endpoints or changes existing ones, re-import to pick up the changes:

1. Go to [chat.openai.com](https://chat.openai.com) → **Explore GPTs → My GPTs** → click your PotterDoc Assistant → **Edit**.
2. In the **Configure** tab, scroll to **Actions** and click the action name.
3. Click **Import from URL**, re-enter `https://potterdoc.com/api/schema/llm/`, and click **Import**.
4. Review any new or changed operations, then click **Update** to save.

You can also preview the current schema at any time by opening `https://potterdoc.com/api/schema/llm/` in a browser — it returns the live OpenAPI JSON.

---

## Known Limitations

| Limitation | Workaround |
|---|---|
| Images must be attached directly in the chat — the API does not accept external URLs | Attach the photo as a file in the ChatGPT conversation; the GPT will upload it to PotterDoc |
| Public library objects (clay bodies, glaze types, firing temperatures) cannot be created or edited by agents | Request additions from your PotterDoc administrator |
| Agent tokens cannot revoke themselves | Revoke tokens from Settings → Agent Tokens in the web UI |
| State transitions are permanent (append-only history) | The assistant will always ask for confirmation before transitioning |

---

## Verification Checklist

After completing setup, confirm each item works in the GPT Builder preview pane:

- [ ] "Create a new piece called Test" → GPT creates a piece and reports the `designed` state
- [ ] "Show me my recent pieces" → GPT lists pieces with names and current states
- [ ] "What states can my Test piece move to?" → GPT fetches the piece and lists `successors`
- [ ] "Transition Test to wheel_thrown" → GPT asks for confirmation, then executes the transition
- [ ] "What clay bodies are available?" → GPT fetches `GET /api/globals/clay_body/` and lists results
- [ ] Attach a photo and say "Add this to my Test piece" → GPT calls the upload endpoint and confirms the image was added
- [ ] "Crop the image to show just the top half" → GPT calls `PATCH /api/images/{id}/crop/` with appropriate coordinates
