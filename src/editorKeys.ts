// Escape in the Editor: Excalidraw uses it to back out of whatever is in
// progress (text editing, a selection, a tool, a menu). Only when there is
// nothing left for Excalidraw to dismiss does Escape close the Editor.

/** The slice of Excalidraw's appState that Escape can act on. */
export interface EscapeState {
  editingTextElement?: unknown;
  newElement?: unknown;
  multiElement?: unknown;
  selectionElement?: unknown;
  selectedLinearElement?: unknown;
  croppingElementId?: unknown;
  activeEmbeddable?: unknown;
  editingGroupId?: unknown;
  editingFrame?: unknown;
  showHyperlinkPopup?: unknown;
  contextMenu?: unknown;
  openMenu?: unknown;
  openPopup?: unknown;
  openDialog?: unknown;
  openSidebar?: { name?: string; tab?: string } | null;
  defaultSidebarDockedPreference?: boolean;
  activeTool?: { type: string } | null;
  preferredSelectionTool?: { type: string } | null;
  selectedElementIds?: Readonly<Record<string, boolean>>;
}

const IN_PROGRESS: ReadonlyArray<keyof EscapeState> = [
  "editingTextElement",
  "newElement",
  "multiElement",
  "selectionElement",
  "selectedLinearElement",
  "croppingElementId",
  "activeEmbeddable",
  "editingGroupId",
  "editingFrame",
  "showHyperlinkPopup",
  "contextMenu",
  "openMenu",
  "openPopup",
  "openDialog",
];

/**
 * An open sidebar takes Escape, except the Library docked beside the canvas:
 * Excalidraw leaves that one open on Escape, so it would otherwise block
 * closing the Editor for as long as it is docked.
 */
function sidebarTakesEscape(state: EscapeState): boolean {
  const sidebar = state.openSidebar;
  if (!sidebar) return false;
  const libraryTab = (sidebar.tab ?? "library") === "library";
  return !(libraryTab && state.defaultSidebarDockedPreference === true);
}

/**
 * Whether Escape should close the Editor, judged on the state *before*
 * Excalidraw handles the key. `liveIds` are the ids of non-deleted elements,
 * so a stale selection of a deleted element does not block closing. Pure; tested.
 */
export function escapeClosesEditor(state: EscapeState, liveIds: Iterable<string>): boolean {
  if (IN_PROGRESS.some((key) => state[key] != null && state[key] !== false)) return false;
  if (sidebarTakesEscape(state)) return false;
  const tool = state.activeTool?.type;
  const selectionTool = state.preferredSelectionTool?.type ?? "selection";
  if (tool && tool !== selectionTool) return false;
  const selected = state.selectedElementIds ?? {};
  for (const id of liveIds) if (selected[id]) return false;
  return true;
}
