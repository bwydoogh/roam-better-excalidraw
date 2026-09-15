// Better Excalidraw — entry point. Roam Depot calls onload/onunload; Depot dev
// mode reloads the module without onunload, so cleanup is idempotent and also
// reachable through window.__betterExcalidrawCleanup from a previous instance.
import "./styles.css";
import type { ExtensionAPI } from "./roam-types.d.ts";
import { COMPONENT, isDrawingBlock, isNativeDrawingBlock, toBetterExcalidraw, toNativeExcalidraw, unsupportedNativeTypes } from "./blockString.ts";
import { closeEditor, openEditor } from "./editor.tsx";
import { closeGallery, openGallery } from "./gallery.ts";
import { mountPreview, previewClass, refreshAllPreviews, refreshPreviewsFor, sweepPreviews, unmountAllPreviews } from "./preview.ts";
import { blockString, blockUidFromElement, createChildBlock, focusedBlockUid, loadDrawing, updateBlockString } from "./roam.ts";
import { initSettings } from "./settings.ts";

const BUTTON_SELECTOR = `button.bp3-button.rm-xparser-default-${COMPONENT}`;
const COMMANDS = {
  insert: "Better Excalidraw: Insert drawing here",
  open: "Better Excalidraw: Open drawing editor",
  toBetter: "Better Excalidraw: Convert native drawing to Better Excalidraw",
  toNative: "Better Excalidraw: Convert back to native Excalidraw",
  gallery: "Better Excalidraw: Show all drawings (gallery)",
};


let cleanup: (() => void) | null = null;

function toast(message: string): void {
  console.info(`[better-excalidraw] ${message}`);
}

const editorHandlers = { onSaved: (uid: string) => refreshPreviewsFor(uid) };
const previewHandlers = { onOpen: (uid: string) => openEditor(uid, editorHandlers) };
const galleryHandlers = { onOpen: (uid: string) => openEditor(uid, editorHandlers) };

function upgradeButton(button: HTMLElement): void {
  if (button.dataset.bexMounted === "1") return;
  const uid = blockUidFromElement(button);
  if (!uid) return;
  button.dataset.bexMounted = "1";
  const host = document.createElement("div");
  button.insertAdjacentElement("afterend", host);
  void mountPreview(host, uid, previewHandlers);
}

function scan(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(BUTTON_SELECTOR).forEach(upgradeButton);
}

const SIDEBAR_ITEM_ID = "bex-sidebar-gallery";

/** Adds a clickable "Excalidraw drawings" row to Roam's left sidebar. Idempotent;
 *  Roam re-renders the sidebar freely, so this is re-run from the observer. */
function ensureSidebarItem(): void {
  const content = document.querySelector<HTMLElement>(".roam-sidebar-content");
  if (!content || document.getElementById(SIDEBAR_ITEM_ID)) return;
  const item = document.createElement("div");
  item.id = SIDEBAR_ITEM_ID;
  item.className = "log-button bex-sidebar-item";
  item.setAttribute("role", "button");
  item.tabIndex = 0;
  const icon = document.createElement("span");
  icon.className = "bp3-icon bp3-icon-media";
  const text = document.createElement("span");
  text.className = "bex-sidebar-item-text";
  text.textContent = "Excalidraw drawings";
  item.append(icon, text);
  const open = () => openGallery(galleryHandlers);
  item.onclick = open;
  item.onkeydown = (event) => {
    if (event.key === "Enter") open();
  };
  // Sit just above the Shortcuts section when present, else at the end.
  const anchor = content.querySelector(".starred-pages-wrapper") ?? content.querySelector(".starred-pages");
  if (anchor) anchor.insertAdjacentElement("beforebegin", item);
  else content.append(item);
}

async function insertDrawingHere(): Promise<void> {
  const uid = focusedBlockUid();
  if (!uid) return toast("focus a block first");
  const current = blockString(uid);
  let target = uid;
  if (current.trim() === "") {
    await updateBlockString(uid, () => `{{${COMPONENT}}}`);
  } else if (!isDrawingBlock(current)) {
    target = await createChildBlock(uid, `{{${COMPONENT}}}`);
  }
  openEditor(target, editorHandlers);
}

function openFocused(): void {
  const uid = focusedBlockUid();
  if (!uid) return toast("focus a block first");
  if (!isDrawingBlock(blockString(uid))) return toast("focused block is not a Better Excalidraw drawing");
  openEditor(uid, editorHandlers);
}

async function convertFocused(direction: "toBetter" | "toNative"): Promise<void> {
  const uid = focusedBlockUid();
  if (!uid) return toast("focus a block first");
  const current = blockString(uid);
  if (direction === "toBetter" && !isNativeDrawingBlock(current)) return toast("focused block is not a native Excalidraw drawing");
  if (direction === "toNative" && !isDrawingBlock(current)) return toast("focused block is not a Better Excalidraw drawing");
  if (direction === "toNative") {
    const unsupported = unsupportedNativeTypes(loadDrawing(uid).elements as Array<{ type: string; isDeleted?: boolean }>);
    if (unsupported.length > 0) {
      const ok = window.confirm(
        `This drawing uses element types Roam's built-in Excalidraw cannot render: ${unsupported.join(", ")}.\n` +
          "The data is kept, but those elements will be invisible (or break the drawing) in native mode until you convert back.\n\nConvert anyway?",
      );
      if (!ok) return;
    }
  }
  await updateBlockString(uid, direction === "toBetter" ? toBetterExcalidraw : toNativeExcalidraw);
}

function onload({ extensionAPI }: { extensionAPI: ExtensionAPI }): void {
  cleanup?.();
  window.__betterExcalidrawCleanup?.();

  initSettings(extensionAPI);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(BUTTON_SELECTOR)) upgradeButton(node);
        else scan(node);
      }
    }
    ensureSidebarItem();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scan(document.body);
  ensureSidebarItem();

  const themeObserver = new MutationObserver(() => refreshAllPreviews());
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  const sweep = window.setInterval(sweepPreviews, 30_000);

  const palette = window.roamAlphaAPI.ui.commandPalette;
  palette.addCommand({ label: COMMANDS.insert, callback: () => void insertDrawingHere() });
  palette.addCommand({ label: COMMANDS.open, callback: openFocused });
  palette.addCommand({ label: COMMANDS.toBetter, callback: () => void convertFocused("toBetter") });
  palette.addCommand({ label: COMMANDS.toNative, callback: () => void convertFocused("toNative") });
  palette.addCommand({ label: COMMANDS.gallery, callback: () => openGallery(galleryHandlers) });

  cleanup = () => {
    observer.disconnect();
    themeObserver.disconnect();
    window.clearInterval(sweep);
    for (const label of Object.values(COMMANDS)) palette.removeCommand({ label });
    document.getElementById(SIDEBAR_ITEM_ID)?.remove();
    closeGallery();
    void closeEditor();
    unmountAllPreviews();
    document.querySelectorAll<HTMLElement>(`${BUTTON_SELECTOR}[data-bex-mounted]`).forEach((b) => delete b.dataset.bexMounted);
    document.querySelectorAll(`.${previewClass()}`).forEach((n) => n.remove());
    cleanup = null;
    delete window.__betterExcalidrawCleanup;
  };
  window.__betterExcalidrawCleanup = cleanup;
}

function onunload(): void {
  cleanup?.();
}

export default { onload, onunload };
