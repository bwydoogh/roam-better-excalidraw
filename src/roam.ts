// Thin wrappers around window.roamAlphaAPI. Every write is read-merge-write:
// the block is pulled fresh right before the transaction.
import type { RoamPullBlock } from "./roam-types.d.ts";
import { mergeDrawingProps, readDrawing, type DrawingData } from "./schema.ts";
import { buildMirror, withMirror, type MirrorSource } from "./blockString.ts";

const PULL_PATTERN = "[:block/uid :block/string :block/props]";

export function pullBlock(uid: string): RoamPullBlock | null {
  try {
    return window.roamAlphaAPI.pull(PULL_PATTERN, [":block/uid", uid]);
  } catch (error) {
    console.warn("[better-excalidraw] pull failed", uid, error);
    return null;
  }
}

export function blockString(uid: string): string {
  return pullBlock(uid)?.[":block/string"] ?? "";
}

export function loadDrawing(uid: string): DrawingData {
  const drawing = readDrawing(pullBlock(uid)?.[":block/props"]);
  if (!drawing.instanceId) drawing.instanceId = crypto.randomUUID();
  return drawing;
}

/**
 * Persists a drawing: props (merged over the fresh map) plus the Text mirror
 * spliced into the fresh block string. Only the mirror segment of the string
 * is ever rewritten, so concurrent caption edits are never lost.
 */
export async function saveDrawing(uid: string, drawing: DrawingData): Promise<void> {
  const fresh = pullBlock(uid);
  if (!fresh) throw new Error(`block ${uid} no longer exists`);
  const currentString = fresh[":block/string"] ?? "";
  const nextString = withMirror(currentString, buildMirror(drawing.elements as MirrorSource[]));
  const block: { uid: string; string?: string; props: Record<string, unknown> } = {
    uid,
    props: mergeDrawingProps(fresh[":block/props"], drawing),
  };
  if (nextString !== currentString) block.string = nextString;
  await window.roamAlphaAPI.data.block.update({ block });
}

/** Rewrites only the block string, via a transform over the fresh value. */
export async function updateBlockString(uid: string, transform: (current: string) => string): Promise<boolean> {
  const current = blockString(uid);
  const next = transform(current);
  if (next === current) return false;
  await window.roamAlphaAPI.data.block.update({ block: { uid, string: next } });
  return true;
}

export async function createChildBlock(parentUid: string, string: string): Promise<string> {
  const uid = window.roamAlphaAPI.util.generateUID();
  await window.roamAlphaAPI.data.block.create({
    location: { "parent-uid": parentUid, order: "last" },
    block: { uid, string },
  });
  return uid;
}

export function focusedBlockUid(): string | null {
  return window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"] ?? null;
}

export function isDarkTheme(): boolean {
  return document.body.classList.contains("rm-dark-theme") || document.documentElement.classList.contains("rm-dark-theme");
}

/** Roam's block containers carry ids like `block-input-<window>-<uid>`; the uid is the last 9 characters. */
export function blockUidFromElement(element: Element): string | null {
  const container = element.closest<HTMLElement>('[id^="block-input-"]');
  const id = container?.id;
  if (!id || id.length < 9) return null;
  return id.slice(-9);
}
