// Pure string logic for Drawing blocks. No DOM, no Roam API, no Excalidraw —
// this module is exercised directly by tools/test-logic.mjs.

export const COMPONENT = "better-excalidraw";

const COMPONENT_RE = /\{\{better-excalidraw(?::\s*([^}]*?))?\s*\}\}/;
const NATIVE_RE = /\{\{\[\[excalidraw\]\]\}\}|\{\{excalidraw\}\}/;
const MIRROR_PREFIX = "{{-: Text elements in drawing: ";
const MIRROR_RE = /\s?\{\{-: Text elements in drawing: [\s\S]*?\}\}/;

export interface DrawingBlockOptions {
  /** Preview height override in px, from `{{better-excalidraw: height=400}}`. */
  height?: number;
}

export function isDrawingBlock(text: string): boolean {
  return COMPONENT_RE.test(text);
}

export function isNativeDrawingBlock(text: string): boolean {
  return NATIVE_RE.test(text);
}

export function parseOptions(text: string): DrawingBlockOptions {
  const match = COMPONENT_RE.exec(text);
  const options: DrawingBlockOptions = {};
  if (!match?.[1]) return options;
  for (const part of match[1].split(/[,\s]+/)) {
    const [key, value] = part.split("=");
    if (key === "height") {
      const height = Number.parseInt(value ?? "", 10);
      if (Number.isFinite(height) && height > 0) options.height = height;
    }
  }
  return options;
}

/** Text of one Excalidraw element as it should appear in the Text mirror. */
export interface MirrorSource {
  type: string;
  isDeleted?: boolean;
  text?: string;
  originalText?: string;
}

/**
 * Builds Roam's hidden-comment Text mirror in the exact format the native
 * `{{[[excalidraw]]}}` block uses, so search behaves identically either way.
 * Returns "" when the drawing has no text.
 */
export function buildMirror(elements: MirrorSource[]): string {
  const texts = elements
    .filter((el) => el.type === "text" && !el.isDeleted)
    .map((el) => (el.originalText ?? el.text ?? "").replace(/\}\}/g, "} }"))
    .filter((t) => t.trim().length > 0);
  if (texts.length === 0) return "";
  return `${MIRROR_PREFIX}${texts.join(" ; ")} }}`;
}

/**
 * Replaces (or inserts, or removes) the Text mirror in a block string while
 * leaving every other character alone: captions, tags and refs the user typed
 * next to the component survive each autosave.
 */
export function withMirror(text: string, mirror: string): string {
  const stripped = text.replace(MIRROR_RE, "");
  if (!mirror) return stripped;
  const componentMatch = COMPONENT_RE.exec(stripped) ?? NATIVE_RE.exec(stripped);
  if (!componentMatch) return `${stripped} ${mirror}`.trim();
  const end = componentMatch.index + componentMatch[0].length;
  return `${stripped.slice(0, end)} ${mirror}${stripped.slice(end)}`;
}

/** `{{[[excalidraw]]}}` → `{{better-excalidraw}}`; everything else untouched. */
export function toBetterExcalidraw(text: string): string {
  return text.replace(NATIVE_RE, `{{${COMPONENT}}}`);
}

/** `{{better-excalidraw: …}}` → `{{[[excalidraw]]}}`; options are dropped (native has none). */
export function toNativeExcalidraw(text: string): string {
  return text.replace(COMPONENT_RE, "{{[[excalidraw]]}}");
}
