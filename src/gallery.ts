// The Gallery: a modal grid of live SVG thumbnails, one per Drawing block in
// the graph. Read-only — it renders each scene through the same export path as
// the inline Preview and never writes anything. Clicking a tile opens the
// Editor. Tiles are rendered once and reordered in place when the sort changes.
// At most one Gallery is open at a time.
import { isDrawingBlock } from "./blockString.ts";
import { renderSceneSvg } from "./preview.ts";
import { listDrawingBlocks, loadDrawing, type DrawingBlockRef } from "./roam.ts";
import { resolveTheme, roamSurfaceColors } from "./theme.ts";

export interface GalleryHandlers {
  onOpen(uid: string): void;
}

type SortField = "edited" | "created" | "page";
type SortDirection = "asc" | "desc";

/** Ascending comparators; the direction toggle flips the sign. */
const SORT_FIELDS: Array<{ key: SortField; label: string; compare: (a: DrawingBlockRef, b: DrawingBlockRef) => number }> = [
  { key: "edited", label: "Last edited", compare: (a, b) => a.editTime - b.editTime },
  { key: "created", label: "Created", compare: (a, b) => a.createTime - b.createTime },
  { key: "page", label: "Page", compare: (a, b) => a.page.localeCompare(b.page) || a.editTime - b.editTime },
];

interface Tile {
  ref: DrawingBlockRef;
  el: HTMLElement;
}

interface ActiveGallery {
  container: HTMLElement;
  grid: HTMLElement;
  onKeyDown: (event: KeyboardEvent) => void;
  tiles: Tile[];
  field: SortField;
  direction: SortDirection;
  directionButton: HTMLButtonElement;
}

let active: ActiveGallery | null = null;

export function isGalleryOpen(): boolean {
  return active !== null;
}

function formatDate(ms: number): string {
  if (!ms) return "unknown";
  return new Date(ms).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(ms: number): string {
  if (!ms) return "unknown";
  return new Date(ms).toLocaleString();
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
  // Blend with whatever Roam is rendering right now (theme, system light/dark)
  // instead of a hardcoded white or near-black.
  const surface = roamSurfaceColors();
  container.style.background = surface.background;
  container.style.color = surface.color;

  const bar = document.createElement("div");
  bar.className = "bex-modal-bar";
  const title = document.createElement("span");
  title.className = "bex-modal-title";
  title.textContent = "Better Excalidraw · loading drawings…";

  const actions = document.createElement("div");
  actions.className = "bex-modal-actions";
  const sortLabel = document.createElement("label");
  sortLabel.className = "bex-gallery-sort";
  sortLabel.textContent = "Sort by ";
  const sortSelect = document.createElement("select");
  sortSelect.className = "bp3-input";
  for (const { key, label } of SORT_FIELDS) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = label;
    sortSelect.append(option);
  }
  sortSelect.onchange = () => applySort(sortSelect.value as SortField, active?.direction ?? "desc");
  const directionButton = document.createElement("button");
  directionButton.className = "bp3-button bp3-minimal bex-gallery-direction";
  directionButton.onclick = () => {
    if (!active) return;
    applySort(active.field, active.direction === "desc" ? "asc" : "desc");
  };
  sortLabel.append(sortSelect, directionButton);
  const closeButton = document.createElement("button");
  closeButton.className = "bp3-button bp3-minimal bex-modal-close";
  closeButton.textContent = "Close";
  closeButton.onclick = () => closeGallery();
  actions.append(sortLabel, closeButton);
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
  active = { container, grid, onKeyDown, tiles: [], field: "edited", direction: "desc", directionButton };
  renderDirection();
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
    const tile = addTile(grid, ref, handlers);
    active.tiles.push(tile);
    await renderThumb(tile.el.querySelector<HTMLElement>(".bex-gallery-thumb")!, ref, theme);
  }
}

function addTile(grid: HTMLElement, ref: DrawingBlockRef, handlers: GalleryHandlers): Tile {
  const el = document.createElement("div");
  el.className = "bex-gallery-tile";
  el.tabIndex = 0;
  el.title = "Click to edit drawing";
  const open = () => {
    closeGallery();
    handlers.onOpen(ref.uid);
  };
  el.onclick = open;
  el.onkeydown = (event) => {
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

  const meta = document.createElement("div");
  meta.className = "bex-gallery-meta";
  const edited = document.createElement("span");
  edited.textContent = `Edited ${formatDate(ref.editTime)}`;
  edited.title = `Last edited ${formatDateTime(ref.editTime)}`;
  const created = document.createElement("span");
  created.textContent = `Created ${formatDate(ref.createTime)}`;
  created.title = `Created ${formatDateTime(ref.createTime)}`;
  meta.append(edited, created);

  el.append(thumb, label, meta);
  grid.append(el);
  return { ref, el };
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

/** Reorders the already-rendered tiles in place; no thumbnail is re-rendered. */
function applySort(field: SortField, direction: SortDirection): void {
  if (!active) return;
  active.field = field;
  active.direction = direction;
  renderDirection();
  const compare = SORT_FIELDS.find((s) => s.key === field)?.compare;
  if (!compare) return;
  const sign = direction === "desc" ? -1 : 1;
  active.tiles.sort((a, b) => sign * compare(a.ref, b.ref));
  for (const tile of active.tiles) active.grid.append(tile.el);
}

/** Direction toggle: arrow plus a label that reads naturally for the field. */
function renderDirection(): void {
  if (!active) return;
  const { field, direction, directionButton } = active;
  const desc = direction === "desc";
  const label = field === "page" ? (desc ? "Z–A" : "A–Z") : desc ? "Newest first" : "Oldest first";
  directionButton.textContent = `${desc ? "↓" : "↑"} ${label}`;
  directionButton.title = "Toggle sort direction";
}

export function closeGallery(): void {
  const current = active;
  if (!current) return;
  active = null;
  current.container.removeEventListener("keydown", current.onKeyDown);
  current.container.remove();
}
