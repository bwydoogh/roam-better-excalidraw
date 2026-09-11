// Inline read-only Preview of a Drawing block: an SVG exported from the scene,
// cached per block so a page full of drawings renders each one once.
import { exportToSvg } from "@excalidraw/excalidraw";
import type { DrawingData } from "./schema.ts";
import { parseOptions } from "./blockString.ts";
import { blockString, loadDrawing } from "./roam.ts";
import { getSettings } from "./settings.ts";
import { resolveTheme } from "./theme.ts";

const CLASS = "bex-preview";
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
  const svg = await exportToSvg({
    elements: live as never,
    appState: {
      ...(drawing.appState as object),
      exportWithDarkMode: theme === "dark",
      exportBackground: false,
      theme,
    } as never,
    files: drawing.files as never,
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
  await refreshPreview(host, uid);
}

export async function refreshPreview(host: HTMLElement, uid: string): Promise<void> {
  const drawing = loadDrawing(uid);
  const theme = resolveTheme();
  const options = parseOptions(blockString(uid));
  const maxHeight = options.height ?? getSettings().maxPreviewHeight;
  host.classList.toggle("bex-dark", theme === "dark");
  host.style.maxHeight = `${maxHeight}px`;
  host.style.height = options.height ? `${options.height}px` : "";
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
  const width = Number(svg.getAttribute("width")) || 0;
  const height = Number(svg.getAttribute("height")) || 0;
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  if (width && height) {
    svg.setAttribute("viewBox", svg.getAttribute("viewBox") ?? `0 0 ${width} ${height}`);
    svg.style.aspectRatio = `${width} / ${height}`;
  }
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  host.append(svg);
}

/** Re-renders every mounted Preview of a block; called after each save. */
export function refreshPreviewsFor(uid: string): void {
  cache.delete(uid);
  for (const host of mounted.get(uid) ?? []) {
    if (host.isConnected) void refreshPreview(host, uid);
    else mounted.get(uid)?.delete(host);
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
}

export function previewClass(): string {
  return CLASS;
}
