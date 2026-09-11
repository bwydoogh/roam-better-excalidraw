# Development

Better Excalidraw is a Roam Depot-ready extension. The public `README.md` is
written for Roam Depot users; this file holds local development, test and
release notes. Vocabulary: `CONTEXT.md`. Decisions: `docs/adr/`.

## Files

- `src/`: TypeScript sources. **Edit these, never the root `extension.js` / `extension.css`.**
- `tools/build.mjs`: esbuild bundling with the React-host shim and the Excalidraw trim plugin.
- `tools/test-logic.mjs`: browser-free checks for the pure modules.
- `build.sh`: what Roam Depot runs before collecting the two shipped files (`npm ci` + build).
- `extension.js`, `extension.css`: **generated and committed** — the shipped artifacts.
- `dev-server.mjs`: dependency-free local server with CORS headers.

### Why the generated files are committed

Roam Depot only publishes `extension.js` and `extension.css`. The Depot
developer-mode folder picker and jsDelivr commit URLs read them straight from
the repo without running `build.sh`, so they must be committed. `npm run check`
fails if they have drifted from `src/`.

### Bundle size

Excalidraw is ESM-only and ships lazy chunks that esbuild inlines. The trim
plugin stubs the Mermaid converter (~3 MB) and every locale except en/nl/fr/de
(~1.5 MB). What remains (~3 MB) includes a ~1.8 MB harfbuzz wasm used for font
subsetting in SVG export; shrinking that is milestone 3 work.

## Commands

```sh
npm run build        # src/ -> extension.js + extension.css (run after every source edit)
npm run check        # typecheck + logic tests + build-drift check
npm run test         # logic tests only
npm run watch        # rebuild on change (unminified)
npm run dev          # serve on http://localhost:8790 with CORS
git diff --check     # required pre-commit whitespace check
```

## Local test in Roam

Run `npm run build`, then `npm run dev`.

### Roam Depot development mode

1. Enable development mode in Roam Depot settings.
2. Use the folder picker to load this repository folder.
3. Open the extension settings tab named `Better Excalidraw`.

### Load extension from URL

```text
http://localhost:8790/extension.js
```

After pushing to GitHub, test a fixed commit through jsDelivr:

```text
https://cdn.jsdelivr.net/gh/bwydoogh/roam-better-excalidraw@COMMIT_SHA/extension.js
```

## Manual test checklist

The pure logic is covered by `npm run test`. Everything below is browser-only
and must be walked through every release.

1. **Render.** Type `{{better-excalidraw}}` in a block and leave it. The inert
   button is replaced by an "Empty drawing — click to draw" Preview.
2. **Edit and autosave.** Click the Preview. The Editor opens full-screen. Draw a
   rectangle with the text `Hello`. Wait 2 s, then check the block string in the
   console: `window.roamAlphaAPI.pull("[:block/string :block/props]", [":block/uid", "UID"])`.
   The string ends with `{{-: Text elements in drawing: Hello }}`; props carry
   `excalidraw/elements-json`.
3. **Caption survives.** Add ` my caption #diagram` after the component, edit
   the drawing again, and confirm the caption and tag are still there.
4. **Search.** Roam search for `Hello` finds the block; clicking it lands on the
   Preview.
5. **Close and reopen.** "Save & close", then reopen: the drawing, zoom and
   scroll position are as you left them. Escape with nothing selected closes too.
6. **Convert to native.** Command palette → "Convert back to native
   Excalidraw". Roam's own renderer shows the same drawing. **This step proves
   the props key spelling; if the native drawing is empty, the write spelling is
   wrong.** Convert forward again with "Convert native drawing to Better
   Excalidraw".
7. **Existing native drawing.** Convert one of your real `{{[[excalidraw]]}}`
   blocks forward, open it in the Editor, close, convert back. Nothing lost.
8. **Size overrides.** `{{better-excalidraw: height=200}}` clamps the Preview
   height; `width=300` caps its width; the settings panel's maximum width
   applies when no override is present.
9. **Sidebar and refs.** Open the block in the right sidebar and via `((ref))`
   on another page. Each shows a Preview; editing one refreshes all after save.
10. **Dark theme.** Toggle Roam's theme; Previews re-render in dark mode.
11. **Reload.** Depot dev mode reload: no duplicated Previews, no leaked
    commands in the command palette, one Editor at most.

## Release checklist

1. `npm run check` and `git diff --check` are clean.
2. Walk the manual checklist above in a real graph.
3. Bump `version` in `package.json`, update `CHANGELOG.md`, commit, push.
4. Update `source_commit` in `extensions/bwydoogh/roam-better-excalidraw.json` in
   `Roam-Research/roam-depot` and open the PR.
