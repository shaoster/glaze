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

## Shared web modules

Mobile imports shared modules from `web/src`:

- `web/src/api.ts`
- `web/src/types.ts`
- `web/src/workflow.ts`
- `web/src/yaml.d.ts`

This keeps API contracts, workflow field behavior, and types in one place for both web and mobile.
