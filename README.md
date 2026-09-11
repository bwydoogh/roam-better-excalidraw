# Better Excalidraw for Roam Research

A better Excalidraw block for Roam: a sharp inline preview, a full-size editor
with autosave, and lossless conversion to and from Roam's native
`{{[[excalidraw]]}}` drawings.

## Usage

- Type `{{better-excalidraw}}` in a block, or run **Better Excalidraw: Insert
  drawing here** from the command palette. Click the preview to draw.
- Text in your drawings is searchable in Roam, exactly like native drawings.
- Captions, tags and references typed next to the component are preserved.
- `{{better-excalidraw: height=300}}` fixes the preview height for one block.

## Converting native drawings

Focus a `{{[[excalidraw]]}}` block and run **Convert native drawing to Better
Excalidraw**. The drawing data is untouched; only the block text changes. **Convert
back to native Excalidraw** reverses it. Disabling the extension never loses a
drawing: convert back and Roam renders it again.

## Settings

Maximum preview height, theme (auto / light / dark), autosave delay, editor
language, and grid-by-default.

## Development

See `DEVELOPMENT.md`.
