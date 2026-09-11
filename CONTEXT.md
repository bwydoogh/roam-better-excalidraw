# Better Excalidraw — Context

Glossary for the Roam Depot extension "Better Excalidraw". Terms only, no implementation details.

## Terms

- **Drawing**: an Excalidraw scene (elements plus app state) that lives on exactly one Roam block.
- **Drawing block**: the Roam block that owns a Drawing. Its text starts with `{{better-excalidraw}}`.
- **Native drawing**: a Drawing created by Roam's built-in Excalidraw feature, whose block text starts with `{{[[excalidraw]]}}`. Native drawings are not owned by this extension until they are Converted.
- **Convert**: turning a Native drawing into a Drawing block (or back) without losing any scene content.
- **Text mirror**: the plain-text copy of every text element in a Drawing, kept on the Drawing block so Roam search and backlinks can find the Drawing.
- **Preview**: the read-only rendering of a Drawing shown inline in the Roam outline.
- **Editor**: the full Excalidraw editing surface, opened from a Preview.
- **Library**: the user's personal collection of reusable Excalidraw shapes, shared by every Drawing and stored in the graph so it follows the user across devices.
- **Height override**: a per-Drawing-block setting in the block text that fixes the Preview height instead of the global maximum.
