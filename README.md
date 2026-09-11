# Better Excalidraw for Roam Research

A better Excalidraw block for Roam: a sharp inline preview, a full-size editor
with autosave, and lossless conversion to and from Roam's native
`{{[[excalidraw]]}}` drawings.

## Usage

- Type `{{better-excalidraw}}` in a block, or run **Better Excalidraw: Insert
  drawing here** from the command palette. Click the preview to draw.
- Text in your drawings is searchable in Roam, exactly like native drawings.
- Captions, tags and references typed next to the component are preserved.
- `{{better-excalidraw: height=300}}` fixes the preview height for one block;
  `width=400` caps its width. Both can be combined.

## In the editor

- **Insert as image** (top bar) uploads a PNG of the drawing to Roam and adds it
  as a child block, handy for sharing or embedding elsewhere.
- Copy as PNG/SVG and download live in Excalidraw's own export dialog.
- Your **library** of reusable shapes is stored on the page
  `roam/better-excalidraw`, so it follows you across devices.
- Text containing `[[Page]]`, `#tag` or `((ref))` is a real Roam reference: the
  drawing shows up in that page's linked references. Shift+click such a text in
  the editor to open it in the sidebar; Cmd/Ctrl+click to close the editor and
  navigate there.

## Converting native drawings

Focus a `{{[[excalidraw]]}}` block and run **Convert native drawing to Better
Excalidraw**. The drawing data is untouched; only the block text changes. **Convert
back to native Excalidraw** reverses it. Disabling the extension never loses a
drawing: convert back and Roam renders it again.

## Settings

Maximum preview height and width, theme (auto / light / dark), autosave delay,
editor language, grid-by-default, and snap-to-objects-by-default.

## Development

See `DEVELOPMENT.md`.
