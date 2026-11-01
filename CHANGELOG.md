# Changelog

## Unreleased

- Excalidraw bumped to nightly 0.18.0-4ce8305 (2026-10-27), which replaces
  `exportToSvg`/`exportToBlob` with `exportScene`; Preview and "Insert as
  image" moved over, keeping frame rendering and export scale but no longer
  embedding the scene in the exported image. Dev tooling: esbuild 0.28,
  TypeScript 7.
- Excalidraw bumped to nightly 0.18.0-afa3a65 (2026-09-10): sticky notes and
  five months of upstream fixes. Convert-back-to-native warns when a drawing
  uses element types Roam's built-in renderer does not know.
- Milestone 4: "Insert as image" in the editor, library persisted on the page
  `roam/better-excalidraw`, Shift/Cmd+click on Roam links inside drawings.
- Milestone 3: images are stored in Roam's file storage exactly like native
  drawings (`customData.firebaseUrl`), and Excalidraw's fonts ship inside the
  bundle instead of loading from a CDN.
- Milestone 2: live previews via pull-watch, dark theme, correct uids for inline
  refs, previews never upscale; settings for max preview width and
  snap-to-objects default.
- Milestone 1: `{{better-excalidraw}}` block with inline SVG preview, full-size
  editor modal with debounced autosave, Text mirror for search, and Convert to
  and from Roam's native Excalidraw block.
