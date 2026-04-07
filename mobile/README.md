# Glaze Mobile

React Native (Expo) implementation of the Glaze UI, parallel to `web/`.

## What is ported

- Piece list screen with piece cards.
- Create piece modal with name, notes, thumbnail selection, and location global picker.
- Piece detail screen with current state editing.
- Workflow state editor with:
  - dynamic `additional_fields` from `workflow.yml`
  - global refs with inline create support
  - `current_location` editing that only persists when Save is pressed
  - image add/remove
  - state transition actions

## Run locally

```bash
cd mobile
npm install
npm run start
```

Then open in Expo Go, Android emulator, iOS simulator, or web.

## API base URL

The mobile app uses:

- `EXPO_PUBLIC_API_BASE_URL` if set
- otherwise `http://localhost:8080/api/`

Example:

```bash
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080/api/ npm run android
```

Use a device-reachable host when running on a phone/emulator (for Android emulator, `10.0.2.2` maps to host localhost).

## Local secrets and config (git-safe)

Create `mobile/.env.local` from the template:

```bash
cp mobile/.env.example mobile/.env.local
```

These files are gitignored, so Cloudinary/API values are safe for local use and won't be committed.
If you use `source env.sh`, it also auto-loads `.env.local`, `web/.env.local`, and `mobile/.env.local`.

For Cloudinary uploads, prefer backend-signed config in root `.env.local`:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

This keeps secrets out of the mobile/web client bundles.

## Shared web modules

Mobile imports shared modules from `frontend_common/src`:

- `frontend_common/src/api.ts`
- `frontend_common/src/types.ts`
- `frontend_common/src/workflow.ts`
- `frontend_common/src/yaml.d.ts`

This keeps API contracts, workflow field behavior, and types in one place for both web and mobile.
