# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `CONTEXT.md` first: it is the glossary (Drawing, Drawing block, Native drawing, Convert, Text mirror, Preview, Editor, Drawing index, Library, Height override, Width override). Use those words in code, comments and commits. Decisions with real trade-offs live in `docs/adr/`.

## Commands

- `npm run build` — bundle `src/` (TypeScript + Excalidraw) into the root `extension.js` and `extension.css`. **Run after every source edit.**
- `npm run check` — the gate: `tsc --noEmit`, `tools/test-logic.mjs`, and a build-drift check. Runs no browser.
- `npm run test` — logic checks only (Node's built-in test runner, imports `.ts` directly).
- `npm run watch` — rebuild on change (unminified).
- `npm run deploy-dev` — `git push` plus a jsDelivr cache purge; Roam loads `https://cdn.jsdelivr.net/gh/bwydoogh/roam-better-excalidraw@main/extension.js` in dev mode, so every pushed change needs this followed by `View → Reload` in Roam.
- `npm run dev` — serve the repo on `http://localhost:8790` with CORS, the offline alternative.
- `git diff --check` — required pre-commit whitespace check.

## Architecture

**Edit `src/`, never the root `extension.js` / `extension.css`.** Both are generated, committed, and carry a banner saying so.

### Modules

- `src/blockString.ts` — pure string logic: detect `{{better-excalidraw}}` and native `{{[[excalidraw]]}}`, parse the Height override, build and splice the Text mirror, Convert in both directions. No DOM, no Roam, no Excalidraw. Tested.
- `src/schema.ts` — pure props schema (ADR 0001): read a drawing from any key spelling, merge it back over existing props. Tested.
- `src/roam.ts` — the only module that touches `window.roamAlphaAPI`. `saveDrawing` is read-merge-write.
- `src/preview.ts` — inline SVG Preview with a per-block cache keyed on a scene fingerprint.
- `src/files.ts` — images: upload through `roamAlphaAPI.file.upload`, stamp `customData.firebaseUrl` on the image element like native does, fetch back through `file.get`; only files whose upload failed travel inside the block.
- `src/editor.tsx` — the modal Editor (Excalidraw React component), debounced autosave, single instance.
- `src/drawingIndex.ts` — the Drawing index: a full-screen grid of Preview thumbnails (`mountThumbnail`, mounted lazily on scroll) for every Drawing block found by `queryDrawingBlocks`, with a filter. The Editor opens on top of it.
- `src/library.ts` — the Library persisted in props of a block on page `roam/better-excalidraw`.
- `src/links.ts` — pure: find Roam links in text, resolve the text under the pointer (labelled shapes included). Tested.
- `src/settings.ts`, `src/theme.ts` — settings panel and theme resolution.
- `src/extension.ts` — onload/onunload, the button observer, command palette.
- `tools/build.mjs` — esbuild with two plugins: React is rewritten to `window.React` shims (Depot forbids bundling React), and Excalidraw's Mermaid converter plus unused locales are stubbed.

### Things that are easy to get wrong

- **Never bundle React.** Roam Depot mandates the host's `window.React`/`window.ReactDOM` (18.2) and rejects extensions that ship their own. `tools/build.mjs` rewrites `react`, `react-dom`, `react-dom/client` and `react/jsx-runtime` to shims over those globals. `tsconfig` uses `jsx: react-jsx` so our own TSX goes through the same shim.
- **Props writes replace the whole map.** Roam's `data.block.update({block:{props}})` does not merge. `saveDrawing` pulls the block fresh, `mergeDrawingProps` carries foreign props over and drops every spelling of our own keys before writing the canonical `excalidraw/*` ones. Never write props from a cached read.
- **Only the Text mirror segment of the block string is rewritten.** `withMirror` strips the old `{{-: Text elements in drawing: … }}` and splices the new one after the component. Captions, tags and refs the user typed next to the component must survive. Never rebuild the whole string from a snapshot.
- **Key spelling is unverified in one direction.** Reads tolerate `excalidraw/x`, `:excalidraw/x`, `x` and `:x` because Roam's `pull` may strip keyword namespaces. Writes use `excalidraw/x` (what mlava's Shortcode Embeds extension writes and Roam renders). The manual checklist's "convert back to native" step is what proves the write spelling is right.
- **Custom `{{name}}` components render as an inert `<button class="bp3-button rm-xparser-default-name">`.** The argument (`: height=400`) is not in the DOM; read the block string via the API. The block uid is the last 9 characters of the closest `id^="block-input-"` ancestor.
- **The MutationObserver must not re-mount.** `upgradeButton` marks the button with `data-bex-mounted`; Roam re-renders blocks freely (edit mode, sidebar, embeds) and each fresh button gets its own Preview host.
- **Cleanup must be idempotent.** `onload` first calls the module-local `cleanup`, then `window.__betterExcalidrawCleanup` from a previous module instance. Depot dev mode reloads the module without `onunload`.
- **One Editor at a time.** `openEditor` on a second uid closes the first (flushing its save) and then opens the new one. Escape closes only when the event target is the modal container itself, so Excalidraw's own Escape (deselect) is untouched.
- **Images never live in props unless an upload failed.** `uploadPendingFiles` runs before every save and rewrites image elements with `customData.firebaseUrl`; `filesToPersist` keeps only the leftovers. Native Roam reads the same `firebaseUrl`, so converted drawings keep their images.
- **Excalidraw is pinned to a nightly** (`0.18.0-<sha>`, npm `next` tag) because official releases are rare while master ships daily. Nightlies rename props without notice (`excalidrawAPI` became `onExcalidrawAPI`); run `tsc` after every bump. The nightly knows element types native Roam (0.18.0) does not (`stickynote`, `document`, `video`): `unsupportedNativeTypes` warns before Convert-back-to-native.
- **The font-subsetting Worker is stubbed.** Excalidraw builds its worker from `import.meta.url` of a chunk; inlined into one bundle that would be `extension.js` itself, booting the whole extension inside a Worker. `tools/build.mjs` exports `WorkerUrl = undefined` so Excalidraw subsets on the main thread.
- **Fonts are inlined at build time**, not loaded from esm.sh: `tools/build.mjs` replaces Excalidraw's `"./fonts/…woff2"` literals with data URLs (all but the CJK family). `window.EXCALIDRAW_ASSET_PATH` is deliberately unset.
- **Nothing is saved before the scene is ready.** Excalidraw applies `initialData` asynchronously and fires `onChange` with an empty scene first; with inlined fonts that window can exceed the autosave delay. `sceneReady` flips only once the scene has elements (or the block was empty), and `persist` refuses to write a scene with zero elements over a block that had any: deleting in Excalidraw leaves `isDeleted` markers, so an all-empty scene is always a load failure. This guard exists because a drawing was wiped once; do not remove it.
- **Autosave skips no-op changes.** `getSceneVersion` gates the debounced save; closing forces one final write so appState (zoom, scroll) lands too.

## Testing

`tools/test-logic.mjs` imports `src/blockString.ts` and `src/schema.ts` directly (Node 22 strips types) and covers detection, options, mirror building/splicing, Convert, and props read/merge. Everything that touches Roam's DOM or Excalidraw is browser-only: `DEVELOPMENT.md` has the manual checklist.

## Release

Releases are pinned commits referenced from `extensions/bwydoogh/roam-better-excalidraw.json` in the `Roam-Research/roam-depot` repo. The release checklist in `DEVELOPMENT.md` is the source of truth.
