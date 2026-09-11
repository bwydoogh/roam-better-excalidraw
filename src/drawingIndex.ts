// The Drawing index: a full-screen overview of every Drawing block in the
// graph as Preview thumbnails, most recently edited first. A thumbnail opens
// the Editor on top of the index; its save refreshes the thumbnail as well.
import { captionOf, drawingIndexEntries, matchesIndexFilter, type IndexEntry } from "./blockString.ts";
import { fitBesideSidebar } from "./editor.tsx";
import { mountThumbnail, sweepPreviews, type PreviewHandlers } from "./preview.ts";
import { openInSidebar, openPageInMainWindow, queryDrawingBlocks } from "./roam.ts";
import { resolveTheme } from "./theme.ts";

let active: { container: HTMLElement; close: () => void } | null = null;

function tile(entry: IndexEntry): { element: HTMLElement; thumb: HTMLElement } {
  const element = document.createElement("div");
  element.className = "bex-index-tile";
  const thumb = document.createElement("div");
  // Styled as a Preview right away so the grid does not jump when it mounts.
  thumb.className = "bex-preview bex-thumb";
  const page = document.createElement("a");
  page.className = "bex-index-page";
  page.textContent = entry.pageTitle || "(untitled)";
  page.title = "Click to open the page, Shift+click to open it in the sidebar";
  page.onclick = (event) => {
    event.preventDefault();
    if (event.shiftKey) return openInSidebar(entry.pageUid);
    closeDrawingIndex();
    openPageInMainWindow(entry.pageUid);
  };
  element.append(thumb, page);
  const caption = captionOf(entry.text);
  if (caption) {
    const text = document.createElement("div");
    text.className = "bex-index-caption";
    text.textContent = caption;
    element.append(text);
  }
  return { element, thumb };
}

export function isDrawingIndexOpen(): boolean {
  return active !== null;
}

export function openDrawingIndex(handlers: PreviewHandlers): void {
  if (active) {
    active.container.focus();
    return;
  }
  const entries = drawingIndexEntries(queryDrawingBlocks());

  const container = document.createElement("div");
  container.className = "bex-modal bex-index";
  container.tabIndex = -1;
  container.classList.toggle("bex-dark", resolveTheme() === "dark");

  const bar = document.createElement("div");
  bar.className = "bex-modal-bar";
  const title = document.createElement("span");
  title.className = "bex-modal-title";
  const filter = document.createElement("input");
  filter.className = "bp3-input bex-index-filter";
  filter.type = "search";
  filter.placeholder = "Filter by page or text";
  const closeButton = document.createElement("button");
  closeButton.className = "bp3-button bp3-minimal";
  closeButton.textContent = "Close";
  closeButton.onclick = () => closeDrawingIndex();
  bar.append(title, filter, closeButton);

  const grid = document.createElement("div");
  grid.className = "bex-index-grid";
  container.append(bar, grid);

  // Rendering every drawing up front is slow on a big graph: a thumbnail
  // mounts once it scrolls near the viewport.
  const thumbs = new Map<Element, string>();
  const lazy = new IntersectionObserver(
    (seen) => {
      for (const item of seen) {
        const uid = thumbs.get(item.target);
        if (!item.isIntersecting || !uid) continue;
        thumbs.delete(item.target);
        lazy.unobserve(item.target);
        void mountThumbnail(item.target as HTMLElement, uid, handlers);
      }
    },
    { root: grid, rootMargin: "300px" },
  );

  const tiles = entries.map((entry) => {
    const { element, thumb } = tile(entry);
    thumbs.set(thumb, entry.uid);
    lazy.observe(thumb);
    grid.append(element);
    return { entry, element };
  });

  const empty = document.createElement("div");
  empty.className = "bex-index-empty";
  grid.append(empty);

  const applyFilter = () => {
    let shown = 0;
    for (const { entry, element } of tiles) {
      element.hidden = !matchesIndexFilter(entry, filter.value);
      if (!element.hidden) shown += 1;
    }
    title.textContent = shown === tiles.length ? `Drawings · ${tiles.length}` : `Drawings · ${shown} of ${tiles.length}`;
    empty.hidden = shown > 0;
    empty.textContent = tiles.length === 0 ? "No drawings in this graph yet. Type {{better-excalidraw}} in a block to make one." : "No drawing matches this filter.";
  };
  filter.oninput = applyFilter;
  applyFilter();

  const unfit = fitBesideSidebar(container);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    // Escape clears the filter first, then closes.
    if (event.target === filter && filter.value) {
      filter.value = "";
      applyFilter();
      return;
    }
    closeDrawingIndex();
  };
  container.addEventListener("keydown", onKeyDown);

  document.body.append(container);
  active = {
    container,
    close: () => {
      unfit();
      lazy.disconnect();
      container.removeEventListener("keydown", onKeyDown);
      container.remove();
      // Releases the pull-watches of thumbnails that are not also in the outline.
      sweepPreviews();
    },
  };
  filter.focus();
}

export function closeDrawingIndex(): void {
  const current = active;
  if (!current) return;
  active = null;
  current.close();
}
