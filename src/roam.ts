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

/** Roam's dark theme adds Blueprint's `bp3-dark` to <body>; some themes add `rm-dark-theme`. */
export function isDarkTheme(): boolean {
  const classes = [...document.body.classList, ...document.documentElement.classList];
  return classes.includes("bp3-dark") || classes.includes("rm-dark-theme");
}

/**
 * The uid of the block a rendered component belongs to. An inline `((ref))`
 * renders inside `.rm-block-ref[data-uid]`, which must win over the containing
 * block; otherwise Roam's containers carry ids like `block-input-<window>-<uid>`
 * where the uid is the last 9 characters.
 */
export function blockUidFromElement(element: Element): string | null {
  const ref = element.closest<HTMLElement>(".rm-block-ref[data-uid]");
  if (ref?.dataset.uid) return ref.dataset.uid;
  const container = element.closest<HTMLElement>('[id^="block-input-"]');
  const id = container?.id;
  if (!id || id.length < 9) return null;
  return id.slice(-9);
}

type PullWatchCallback = (before: RoamPullBlock | null, after: RoamPullBlock | null) => void;
const watches = new Map<string, PullWatchCallback>();

/** Watches a block's string and props; one watch per uid, idempotent. */
export function watchBlock(uid: string, onChange: () => void): void {
  if (watches.has(uid)) return;
  const callback: PullWatchCallback = () => onChange();
  watches.set(uid, callback);
  try {
    window.roamAlphaAPI.data.addPullWatch(PULL_PATTERN, `[:block/uid "${uid}"]`, callback);
  } catch (error) {
    console.warn("[better-excalidraw] addPullWatch failed", uid, error);
    watches.delete(uid);
  }
}

export function unwatchBlock(uid: string): void {
  const callback = watches.get(uid);
  if (!callback) return;
  watches.delete(uid);
  try {
    window.roamAlphaAPI.data.removePullWatch(PULL_PATTERN, `[:block/uid "${uid}"]`, callback);
  } catch (error) {
    console.warn("[better-excalidraw] removePullWatch failed", uid, error);
  }
}

export function unwatchAllBlocks(): void {
  for (const uid of [...watches.keys()]) unwatchBlock(uid);
}

export interface DrawingBlockRef {
  uid: string;
  string: string;
  page: string;
  createTime: number;
  editTime: number;
}

/**
 * Every block whose string mentions the component, newest edit first. Runs
 * client-side through `q`, so it works on graphs the MCP servers cannot read.
 * Callers should still filter with `isDrawingBlock` for an exact match.
 */
export function listDrawingBlocks(): DrawingBlockRef[] {
  try {
    const rows = window.roamAlphaAPI.q(
      `[:find ?uid ?string ?title ?created ?edited
        :where
        [?b :block/string ?string]
        [(clojure.string/includes? ?string "{{better-excalidraw")]
        [?b :block/uid ?uid]
        [?b :create/time ?created]
        [?b :edit/time ?edited]
        [?b :block/page ?p]
        [?p :node/title ?title]]`,
    ) as Array<[string, string, string, number, number]>;
    return rows
      .map(([uid, string, page, createTime, editTime]) => ({ uid, string, page, createTime, editTime }))
      .sort((a, b) => b.editTime - a.editTime);
  } catch (error) {
    console.warn("[better-excalidraw] listDrawingBlocks failed", error);
    return [];
  }
}

export function pageUidByTitle(title: string): string | null {
  try {
    const result = window.roamAlphaAPI.q(
      "[:find ?u . :in $ ?t :where [?p :node/title ?t] [?p :block/uid ?u]]",
      title,
    ) as unknown;
    return typeof result === "string" ? result : null;
  } catch {
    return null;
  }
}

export function openInSidebar(uid: string): void {
  void window.roamAlphaAPI.ui.rightSidebar.addWindow({ window: { type: "outline", "block-uid": uid } });
}

export function openInMainWindow(uid: string): void {
  void window.roamAlphaAPI.ui.mainWindow.openBlock({ block: { uid } });
}

/** Resolves (creating when `create`) the block that stores the Library. */
export function ensureLibraryBlock(create: boolean): string | null {
  const title = "roam/better-excalidraw";
  const marker = "Library (managed by Better Excalidraw, do not edit)";
  let pageUid = pageUidByTitle(title);
  if (!pageUid) {
    if (!create) return null;
    pageUid = window.roamAlphaAPI.util.generateUID();
    void window.roamAlphaAPI.data.page.create({ page: { title, uid: pageUid } });
  }
  const page = window.roamAlphaAPI.pull("[{:block/children [:block/uid :block/string]}]", [":block/uid", pageUid]);
  const existing = page?.[":block/children"]?.find((c) => c[":block/string"] === marker);
  if (existing) return existing[":block/uid"];
  if (!create) return null;
  const uid = window.roamAlphaAPI.util.generateUID();
  void window.roamAlphaAPI.data.block.create({ location: { "parent-uid": pageUid, order: "last" }, block: { uid, string: marker } });
  return uid;
}

/** Uploads a PNG of the drawing and adds it as a child block `![](url)`. */
export async function insertImageChild(parentUid: string, blob: Blob): Promise<string | null> {
  const file = new File([blob], `drawing-${parentUid}.png`, { type: "image/png" });
  const result = await window.roamAlphaAPI.file.upload({ file, toast: { hide: true } });
  const string = typeof result === "string" && result.startsWith("![") ? result : `![](${result})`;
  return createChildBlock(parentUid, string);
}
