# 0001 — Reuse Roam's native Excalidraw props schema

Date: 2026-09-11
Status: accepted

## Context

Roam's built-in `{{[[excalidraw]]}}` block stores a drawing entirely in the block's
`:block/props` map (`excalidraw/instance-id`, `excalidraw/elements-json`,
`excalidraw/state-json`, `excalidraw/files-json`, `excalidraw/version`) and mirrors
every text element into the block string as a hidden comment
(`{{-: Text elements in drawing: a ; b ; ... }}`) so Roam search finds the drawing.
Roam documents `:block/props` as internal, but several published Depot extensions
read and write it, and Roam has not changed the shape since Excalidraw 0.18.0.

Better Excalidraw needs a place to store its drawings. The user has 34 native
drawings and wants to be able to leave the extension (or Roam's native feature)
without losing anything.

## Options considered

1. **Reuse the native schema verbatim.** Same props keys, same text-mirror format;
   only the block string differs (`{{better-excalidraw}}` vs `{{[[excalidraw]]}}`).
2. **Own schema** (e.g. one `better-excalidraw` props key, or child blocks, or an
   uploaded `.excalidraw` file) with an explicit migration from native.

## Decision

Option 1. Convert in either direction is a one-word swap of the block string.
Disabling the extension degrades to an inert button; converting back to native
restores Roam's own renderer with zero data loss. Search and backlinks come for
free through the text mirror.

## Consequences

- We are coupled to an undocumented Roam schema. If Roam renames the keys, Convert
  and rendering of newly created native drawings break until we follow.
  Mitigation: the schema is read through one module; every props write merges the
  existing map first.
- Props writes replace the whole map, so a stale read can clobber other
  components' props on the same block. Mitigation: read-merge-write per save.
- Large scenes make large block transactions. Accepted; native has the same cost.
- The exact key naming (with or without the `excalidraw/` prefix) must be verified
  against a live block before the first write.
