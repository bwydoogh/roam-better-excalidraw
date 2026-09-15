// The Gallery: a modal grid of live SVG thumbnails, one per Drawing block in
// the graph. Read-only — it renders each scene through the same export path as
// the inline Preview and never writes anything. Clicking a tile opens the
// Editor. At most one Gallery is open at a time.
import { isDrawingBlock } from "./blockString.ts";
import { renderSceneSvg } from "./preview.ts";
import { listDrawingBlocks, loadDrawing, type DrawingBlockRef } from "./roam.ts";
import { resolveTheme } from "./theme.ts";

export interface GalleryHandlers {
  onOpen(uid: string): void;
}

interface ActiveGallery {
  container: HTMLElement;
  onKeyDown: (event: KeyboardEvent) => void;
}

let active: ActiveGallery | null = null;

export function isGalleryOpen(): boolean {
  return active !== null;
}

export function openGallery(handlers: GalleryHandlers): void {
  if (active) {
    active.container.focus();
    return;
  }
  const theme = resolveTheme();
  const container = document.createElement("div");
  container.className = "bex-modal bex-gallery";
  container.tabIndex = -1;
  container.classList.toggle("bex-dark", theme === "dark");

  const bar = document.createElement("div");
  bar.className = "bex-modal-bar";
  const title = document.createElement("span");
  title.className = "bex-modal-title";
  title.textContent = "Better Excalidraw · loading drawings…";
  const actions = document.createElement("div");
  actions.className = "bex-modal-actions";
  const closeButton = document.createElement("button");
  closeButton.className = "bp3-button bp3-minimal bex-modal-close";
  closeButton.textContent = "Close";
  closeButton.onclick = () => closeGallery();
  actions.append(closeButton);
  bar.append(title, actions);

  const body = document.createElement("div");
  body.className = "bex-gallery-body";
  const grid = document.createElement("div");
  grid.className = "bex-gallery-grid";
  body.append(grid);
  container.append(bar, body);
  document.body.append(container);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !event.defaultPrevented && event.target === container) {
      closeGallery();
    }
  };
  container.addEventListener("keydown", onKeyDown);
  active = { container, onKeyDown };
  container.focus();

  void populate(container, grid, title, theme, handlers);
}

async function populate(
  container: HTMLElement,
  grid: HTMLElement,
  title: HTMLElement,
  theme: "light" | "dark",
  handlers: GalleryHandlers,
): Promise<void> {
  const drawings = listDrawingBlocks().filter((d) => isDrawingBlock(d.string));
  if (active?.container !== container) return; // closed while querying
  title.textContent = `Better Excalidraw · ${drawings.length} drawing${drawings.length === 1 ? "" : "s"}`;
  if (drawings.length === 0) {
    const empty = document.createElement("div");
    empty.className = "bex-gallery-empty";
    empty.textContent = "No drawings found in this graph yet.";
    grid.append(empty);
    return;
  }
  // Render one tile at a time so the grid fills progressively and image
  // drawings (which fetch their files) don't all hit the network at once.
  for (const ref of drawings) {
    if (active?.container !== container) return; // closed mid-render
    const thumb = addTile(grid, ref, handlers);
    await renderThumb(thumb, ref, theme);
  }
}

function addTile(grid: HTMLElement, ref: DrawingBlockRef, handlers: GalleryHandlers): HTMLElement {
  const tile = document.createElement("div");
  tile.className = "bex-gallery-tile";
  tile.tabIndex = 0;
  tile.title = "Click to edit drawing";
  const open = () => {
    closeGallery();
    handlers.onOpen(ref.uid);
  };
  tile.onclick = open;
  tile.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      open();
    }
  };

  const thumb = document.createElement("div");
  thumb.className = "bex-gallery-thumb";
  const loading = document.createElement("div");
  loading.className = "bex-gallery-loading";
  loading.textContent = "…";
  thumb.append(loading);

  const label = document.createElement("div");
  label.className = "bex-gallery-label";
  label.textContent = ref.page || "(no page)";
  label.title = ref.page || "(no page)";

  tile.append(thumb, label);
  grid.append(tile);
  return thumb;
}

async function renderThumb(thumb: HTMLElement, ref: DrawingBlockRef, theme: "light" | "dark"): Promise<void> {
  let svg: SVGSVGElement | null = null;
  try {
    svg = await renderSceneSvg(loadDrawing(ref.uid), theme);
  } catch (error) {
    console.warn("[better-excalidraw] gallery thumbnail failed", ref.uid, error);
  }
  if (!thumb.isConnected) return;
  thumb.replaceChildren();
  if (!svg) {
    const empty = document.createElement("div");
    empty.className = "bex-gallery-loading";
    empty.textContent = "Empty";
    thumb.append(empty);
    return;
  }
  // Match the inline Preview: drop the intrinsic size and let CSS scale the
  // SVG down to the tile while keeping the aspect ratio.
  const viewBox = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const width = Number(svg.getAttribute("width")) || viewBox[2] || 0;
  const height = Number(svg.getAttribute("height")) || viewBox[3] || 0;
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  if (width && height && !svg.getAttribute("viewBox")) svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  thumb.append(svg);
}

export function closeGallery(): void {
  const current = active;
  if (!current) return;
  active = null;
  current.container.removeEventListener("keydown", current.onKeyDown);
  current.container.remove();
}
