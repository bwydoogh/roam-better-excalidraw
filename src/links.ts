// Roam links inside drawings: a text element containing `[[Page]]`, `#tag` or
// `((uid))` can be followed from the Editor.
import type { PointerDownState } from "@excalidraw/excalidraw/types";

export interface RoamLink {
  kind: "page" | "block";
  target: string;
}

const PAGE_RE = /\[\[([^\]]+)\]\]|#\[\[([^\]]+)\]\]|#([^\s#\[\]()]+)/g;
const BLOCK_RE = /\(\(([A-Za-z0-9_-]{9})\)\)/g;

/** Every Roam link in a piece of text, in order of appearance. Pure; tested. */
export function findRoamLinks(text: string): RoamLink[] {
  const links: RoamLink[] = [];
  for (const m of text.matchAll(PAGE_RE)) {
    const title = m[1] ?? m[2] ?? m[3];
    if (title) links.push({ kind: "page", target: title });
  }
  for (const m of text.matchAll(BLOCK_RE)) links.push({ kind: "block", target: m[1] });
  return links;
}

interface TextLike {
  id: string;
  type: string;
  text?: string;
  originalText?: string;
  boundElements?: ReadonlyArray<{ id: string; type: string }> | null;
}

/** Text of the element under the pointer, following a container to its bound label. */
export function textUnderPointer(state: PointerDownState, elements: readonly TextLike[]): string | null {
  const hit = state.hit.element as TextLike | null;
  if (!hit) return null;
  if (hit.type === "text") return hit.originalText ?? hit.text ?? null;
  const labelId = hit.boundElements?.find((b) => b.type === "text")?.id;
  if (!labelId) return null;
  const label = elements.find((el) => el.id === labelId);
  return label?.originalText ?? label?.text ?? null;
}
