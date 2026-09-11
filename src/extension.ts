// Better Excalidraw — entry point. Roam Depot calls onload/onunload; Depot dev
// mode reloads the module without onunload, so cleanup is idempotent and also
// reachable through window.__betterExcalidrawCleanup from a previous instance.
import "./styles.css";
import type { ExtensionAPI } from "./roam-types.d.ts";
import { COMPONENT, isDrawingBlock, isNativeDrawingBlock, toBetterExcalidraw, toNativeExcalidraw } from "./blockString.ts";
import { closeEditor, openEditor } from "./editor.tsx";
import { mountPreview, previewClass, refreshAllPreviews, refreshPreviewsFor, unmountAllPreviews } from "./preview.ts";
import { blockString, blockUidFromElement, createChildBlock, focusedBlockUid, updateBlockString } from "./roam.ts";
import { initSettings } from "./settings.ts";

const BUTTON_SELECTOR = `button.bp3-button.rm-xparser-default-${COMPONENT}`;
const COMMANDS = {
  insert: "Better Excalidraw: Insert drawing here",
  open: "Better Excalidraw: Open drawing editor",
  toBetter: "Better Excalidraw: Convert native drawing to Better Excalidraw",
  toNative: "Better Excalidraw: Convert back to native Excalidraw",
};

let cleanup: (() => void) | null = null;

function toast(message: string): void {
  console.info(`[better-excalidraw] ${message}`);
}

const editorHandlers = { onSaved: (uid: string) => refreshPreviewsFor(uid) };
const previewHandlers = { onOpen: (uid: string) => openEditor(uid, editorHandlers) };

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
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scan(document.body);

  const themeObserver = new MutationObserver(() => refreshAllPreviews());
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  const palette = window.roamAlphaAPI.ui.commandPalette;
  palette.addCommand({ label: COMMANDS.insert, callback: () => void insertDrawingHere() });
  palette.addCommand({ label: COMMANDS.open, callback: openFocused });
  palette.addCommand({ label: COMMANDS.toBetter, callback: () => void convertFocused("toBetter") });
  palette.addCommand({ label: COMMANDS.toNative, callback: () => void convertFocused("toNative") });

  cleanup = () => {
    observer.disconnect();
    themeObserver.disconnect();
    for (const label of Object.values(COMMANDS)) palette.removeCommand({ label });
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
