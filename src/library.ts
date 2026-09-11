// The Library: Excalidraw's reusable shapes, persisted in the graph on the
// page `roam/better-excalidraw` so it follows the user across devices.
import type { LibraryItems } from "@excalidraw/excalidraw/types";
import { ensureLibraryBlock, pullBlock } from "./roam.ts";

export const LIBRARY_PAGE = "roam/better-excalidraw";
export const LIBRARY_BLOCK_TEXT = "Library (managed by Better Excalidraw, do not edit)";
const KEY = "better-excalidraw/library-json";

let cached: LibraryItems | null = null;
let saveChain: Promise<void> = Promise.resolve();

export function loadLibrary(): LibraryItems {
  if (cached) return cached;
  try {
    const uid = ensureLibraryBlock(false);
    const props = uid ? pullBlock(uid)?.[":block/props"] ?? {} : {};
    const raw = props[KEY] ?? props[`:${KEY}`] ?? props["library-json"] ?? props[":library-json"];
    cached = typeof raw === "string" && raw ? (JSON.parse(raw) as LibraryItems) : [];
  } catch (error) {
    console.warn("[better-excalidraw] library load failed", error);
    cached = [];
  }
  return cached;
}

export function saveLibrary(items: LibraryItems): void {
  cached = items;
  saveChain = saveChain
    .then(async () => {
      const uid = ensureLibraryBlock(true);
      if (!uid) return;
      const props = { ...(pullBlock(uid)?.[":block/props"] ?? {}) };
      for (const key of Object.keys(props)) {
        if (key.endsWith("library-json")) delete props[key];
      }
      props[KEY] = JSON.stringify(items);
      await window.roamAlphaAPI.data.block.update({ block: { uid, props } });
    })
    .catch((error) => console.error("[better-excalidraw] library save failed", error));
}
