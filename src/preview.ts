// Inline read-only Preview of a Drawing block: an SVG exported from the scene,
// cached per block so a page full of drawings renders each one once.
import { exportToSvg } from "@excalidraw/excalidraw";
import type { DrawingData } from "./schema.ts";
import { resolveFiles, type ImageLikeElement } from "./files.ts";
import { parseOptions } from "./blockString.ts";
import { blockString, loadDrawing, unwatchAllBlocks, unwatchBlock, watchBlock } from "./roam.ts";
import { getSettings } from "./settings.ts";
import { resolveTheme } from "./theme.ts";

const CLASS = "bex-preview";
const THUMB_CLASS = "bex-thumb";
const cache = new Map<string, { key: string; svg: SVGSVGElement }>();
const mounted = new Map<string, Set<HTMLElement>>();

function sceneKey(drawing: DrawingData, theme: string): string {
  // Cheap fingerprint: element count + summed versions + theme. Elements carry a
  // monotonically increasing `version`, so any edit changes the sum.
  let sum = 0;
  for (const el of drawing.elements as Array<{ version?: number; isDeleted?: boolean }>) {
    sum += (el.version ?? 0) + (el.isDeleted ? 1_000_003 : 0);
  }
  return `${drawing.elements.length}:${sum}:${theme}:${drawing.instanceId}`;
}

async function renderSvg(uid: string, drawing: DrawingData, theme: "light" | "dark"): Promise<SVGSVGElement | null> {
  const key = sceneKey(drawing, theme);
  const hit = cache.get(uid);
  if (hit && hit.key === key) return hit.svg.cloneNode(true) as SVGSVGElement;
  const live = (drawing.elements as Array<{ isDeleted?: boolean }>).filter((el) => !el.isDeleted);
  if (live.length === 0) return null;
  const stored = drawing.files as never;
  const files = { ...(drawing.files as object), ...(await resolveFiles(live as ImageLikeElement[], stored)) };
  const svg = await exportToSvg({
    elements: live as never,
    appState: {
      ...(drawing.appState as object),
      exportWithDarkMode: theme === "dark",
      exportBackground: false,
      theme,
    } as never,
    files: files as never,
    exportPadding: 16,
  });
  cache.set(uid, { key, svg });
  return svg.cloneNode(true) as SVGSVGElement;
}

export interface PreviewHandlers {
  onOpen(uid: string): void;
}

export async function mountPreview(host: HTMLElement, uid: string, handlers: PreviewHandlers): Promise<void> {
  host.classList.add(CLASS);
  host.dataset.uid = uid;
  host.tabIndex = 0;
  host.title = "Click to edit drawing";
  host.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    handlers.onOpen(uid);
  };
  host.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handlers.onOpen(uid);
    }
  };
  if (!mounted.has(uid)) mounted.set(uid, new Set());
  mounted.get(uid)!.add(host);
  // Edits from another window, device or the sidebar arrive through the
  // pull-watch; our own saves call refreshPreviewsFor directly as well.
  watchBlock(uid, () => scheduleRefresh(uid));
  await refreshPreview(host, uid);
}

/**
 * A Preview at thumbnail size, for the Drawing index. It shares the cache,
 * the pull-watch and the refresh-after-save with the Previews in the outline.
 */
export function mountThumbnail(host: HTMLElement, uid: string, handlers: PreviewHandlers): Promise<void> {
  host.classList.add(THUMB_CLASS);
  return mountPreview(host, uid, handlers);
}

const pending = new Map<string, number>();
function scheduleRefresh(uid: string): void {
  const existing = pending.get(uid);
  if (existing !== undefined) window.clearTimeout(existing);
  pending.set(uid, window.setTimeout(() => {
    pending.delete(uid);
    refreshPreviewsFor(uid);
  }, 150));
}

export async function refreshPreview(host: HTMLElement, uid: string): Promise<void> {
  const drawing = loadDrawing(uid);
  const theme = resolveTheme();
  host.classList.toggle("bex-dark", theme === "dark");
  // Thumbnails take their fixed size from CSS; the overrides are for the outline.
  if (!host.classList.contains(THUMB_CLASS)) {
    const options = parseOptions(blockString(uid));
    const settings = getSettings();
    const maxHeight = options.height ?? settings.maxPreviewHeight;
    const maxWidth = options.width ?? settings.maxPreviewWidth;
    host.style.setProperty("--bex-max-height", `${maxHeight}px`);
    host.style.height = options.height ? `${options.height}px` : "";
    host.style.maxWidth = maxWidth > 0 ? `${maxWidth}px` : "";
  }
  let svg: SVGSVGElement | null = null;
  try {
    svg = await renderSvg(uid, drawing, theme);
  } catch (error) {
    console.warn("[better-excalidraw] preview render failed", uid, error);
  }
  if (!host.isConnected) return;
  host.replaceChildren();
  if (!svg) {
    const empty = document.createElement("div");
    empty.className = "bex-preview-empty";
    empty.textContent = "Empty drawing — click to draw";
    host.append(empty);
    return;
  }
  // Natural size comes from the export; CSS scales it down (never up) to fit
  // the block width and the max height while keeping the aspect ratio.
  const viewBox = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const width = Number(svg.getAttribute("width")) || viewBox[2] || 0;
  const height = Number(svg.getAttribute("height")) || viewBox[3] || 0;
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  if (width && height) {
    if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.aspectRatio = `${width} / ${height}`;
    svg.style.maxWidth = `min(100%, ${Math.ceil(width)}px)`;
  }
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  host.append(svg);
}

/** Re-renders every mounted Preview of a block; called after each save. */
export function refreshPreviewsFor(uid: string): void {
  cache.delete(uid);
  const hosts = mounted.get(uid);
  if (!hosts) return;
  for (const host of hosts) {
    if (host.isConnected) void refreshPreview(host, uid);
    else hosts.delete(host);
  }
  if (hosts.size === 0) forget(uid);
}

function forget(uid: string): void {
  mounted.delete(uid);
  cache.delete(uid);
  unwatchBlock(uid);
}

/** Drops hosts Roam has re-rendered away; called periodically so watches don't leak. */
export function sweepPreviews(): void {
  for (const [uid, hosts] of mounted) {
    for (const host of hosts) if (!host.isConnected) hosts.delete(host);
    if (hosts.size === 0) forget(uid);
  }
}

export function refreshAllPreviews(): void {
  cache.clear();
  for (const uid of mounted.keys()) refreshPreviewsFor(uid);
}

export function unmountAllPreviews(): void {
  for (const hosts of mounted.values()) {
    for (const host of hosts) host.remove();
  }
  mounted.clear();
  cache.clear();
  unwatchAllBlocks();
}

export function previewClass(): string {
  return CLASS;
}
