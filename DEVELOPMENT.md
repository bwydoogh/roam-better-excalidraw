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
- `tools/purge-cdn.mjs`: purges jsDelivr's cache for the `@main` URL Roam loads.

### Why the generated files are committed

Roam Depot only publishes `extension.js` and `extension.css`. The Depot
developer-mode folder picker and jsDelivr commit URLs read them straight from
the repo without running `build.sh`, so they must be committed. `npm run check`
fails if they have drifted from `src/`.

### Excalidraw version

`package.json` pins an exact nightly (`0.18.0-<sha>` from the npm `next` tag).
To bump: `npm view @excalidraw/excalidraw dist-tags.next`, install it with
`--save-exact`, run `npm run check`, rebuild, and walk the manual checklist.
Then add any new element type Roam's native renderer can show to
`NATIVE_ELEMENT_TYPES` in `src/blockString.ts` once Roam itself upgrades.

### Bundle size

Excalidraw is ESM-only and ships lazy chunks that esbuild inlines. The trim
plugin stubs the Mermaid converter (~3 MB) and every locale except en/nl/fr/de
(~1.5 MB), and inlines every font except the 12 MB CJK one as data URLs (Depot
ships no asset folder and the alternative is loading fonts from esm.sh). What
remains (~3.4 MB) includes a ~1.8 MB harfbuzz wasm used for font subsetting in
SVG export.

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

### Preferred: load from GitHub through jsDelivr

In Roam Depot development mode choose `Load extension from URL`:

```text
https://cdn.jsdelivr.net/gh/bwydoogh/roam-better-excalidraw@main/extension.js
```

Roam fetches `extension.js` and `extension.css` from there on every app
reload, no folder dialog. The loop per change:

```sh
npm run build && npm run check
git commit -am "..."
npm run deploy-dev        # git push + purge jsDelivr's cache for @main
```

Then `View → Reload` in Roam (⌘R). Roam caches an already-imported module for
the session, so a reload is always needed; if a change still does not show,
use `View → Force Reload` to bypass Electron's HTTP cache.

`npm run purge-cdn` purges without pushing. A pinned commit can be tested with
`@COMMIT_SHA` instead of `@main`; that URL never needs purging.

### Alternative: folder picker

1. Enable development mode in Roam Depot settings.
2. Use the folder picker to load this repository folder (Roam asks again after
   every app reload).
3. Open the extension settings tab named `Better Excalidraw`.

### Alternative: local dev server

`npm run dev`, then `Load extension from URL` with `http://localhost:8790/extension.js`.

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
   scroll position are as you left them. Escape closes too, but only once
   Excalidraw has nothing to cancel: with a shape selected the first Escape
   deselects and the second closes; while typing in a text element Escape ends
   the edit; with the rectangle tool active Escape returns to the selection tool;
   with the help dialog (`?`) open Escape closes just the dialog. Escape while
   editing a block in Roam's right sidebar leaves the Editor open.
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
12. **Images.** Paste an image into the Editor. Within the autosave delay the
    image element gets `customData.firebaseUrl` (check the props) and
    `files-json` stays `{}`. Reload Roam: the Preview and the Editor show the
    image again (fetched through `file.get`, which decrypts on encrypted graphs).
    Convert to native: Roam's own renderer shows the image too.
14. **Insert as image.** In the Editor click "Insert as image": a child block
    `![](url)` appears under the drawing block showing a PNG of the drawing.
15. **Library.** Add a shape to the library, close, reload Roam, reopen any
    drawing: the shape is still in the library. The page `roam/better-excalidraw`
    holds one block with the library in its props.
16. **Links.** Put `[[Some Page]]` in a text element. The drawing block appears
    in that page's linked references. Shift+click the text: the page opens in
    the right sidebar. Cmd/Ctrl+click: the Editor closes and Roam navigates
    to the page.
17. **Convert-back warning.** Add a sticky note (nightly feature) to a
    drawing, run "Convert back to native Excalidraw": a confirm dialog names
    `stickynote`. Cancel keeps the block untouched.
13. **Fonts offline.** Disconnect from the network, reload Roam, open a drawing
    with hand-drawn text: the Excalifont glyphs render, not a fallback sans.

## Release checklist

1. `npm run check` and `git diff --check` are clean.
2. Walk the manual checklist above in a real graph.
3. Bump `version` in `package.json`, update `CHANGELOG.md`, commit, push.
4. Update `source_commit` in `extensions/bwydoogh/roam-better-excalidraw.json` in
   `Roam-Research/roam-depot` and open the PR.

Roam Depot metadata:

```json
{
  "name": "Better Excalidraw",
  "short_description": "Excalidraw drawings with a sharp inline preview, a full-size editor with autosave, and lossless conversion to and from Roam's native drawings.",
  "author": "Benny Wydooghe",
  "tags": ["excalidraw", "drawing", "diagram", "whiteboard"],
  "source_url": "https://github.com/bwydoogh/roam-better-excalidraw",
  "source_repo": "https://github.com/bwydoogh/roam-better-excalidraw.git",
  "source_commit": "FINAL_COMMIT_SHA",
  "stripe_account": "acct_1TzsHJQdGIF0T8Wk"
}
```

`stripe_account` is the same connected-account id as in the other extensions
(a public identifier, not a secret). `source_commit` is filled in at release
time. Depot runs `build.sh` (`npm ci` + esbuild) before collecting
`extension.js` and `extension.css`, and both are committed as well.
