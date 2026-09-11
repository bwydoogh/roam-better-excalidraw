// The Editor: a full-size modal hosting Excalidraw, autosaving to the block.
// At most one Editor is open at a time; opening a second focuses the first.
import { Excalidraw, getSceneVersion, restoreAppState, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { createRoot, type Root } from "react-dom/client";
import { useEffect, useMemo, useRef } from "react";
import { filesToPersist, resolveFiles, uploadPendingFiles, type ImageLikeElement } from "./files.ts";
import { loadDrawing, saveDrawing } from "./roam.ts";
import type { DrawingData } from "./schema.ts";
import { getSettings } from "./settings.ts";
import { resolveTheme } from "./theme.ts";

interface ActiveEditor {
  uid: string;
  container: HTMLElement;
  root: Root;
  close: () => Promise<void>;
}

let active: ActiveEditor | null = null;

export interface EditorHandlers {
  onSaved(uid: string): void;
}

interface EditorProps {
  uid: string;
  initial: DrawingData;
  onSaved(uid: string): void;
  registerClose(fn: () => Promise<void>): void;
}

/** Keys of appState that must not be persisted: transient UI or unserialisable. */
const VOLATILE_STATE = new Set(["collaborators", "contextMenu", "toast", "errorMessage", "openMenu", "openPopup", "openSidebar", "openDialog", "fileHandle", "activeEmbeddable", "editingTextElement", "newElement", "resizingElement", "selectionElement", "userToFollow", "followedBy", "searchMatches", "snapLines", "suggestedBindings"]);

function serialisableState(appState: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(appState)) {
    if (VOLATILE_STATE.has(key)) continue;
    if (typeof value === "function") continue;
    out[key] = value;
  }
  out.collaborators = {};
  return out;
}

function EditorView({ uid, initial, onSaved, registerClose }: EditorProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const lastSavedVersion = useRef<number>(getSceneVersion(initial.elements as never));
  const timer = useRef<number | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const settings = useMemo(() => getSettings(), []);
  const theme = useMemo(() => resolveTheme(), []);

  const initialData = useMemo(() => {
    const appState = restoreAppState(initial.appState as never, null);
    return {
      elements: restoreElements(initial.elements as never, null),
      appState: {
        ...appState,
        gridModeEnabled: settings.gridMode || appState.gridModeEnabled,
        objectsSnapModeEnabled: settings.snapMode || appState.objectsSnapModeEnabled,
        theme,
        collaborators: new Map(),
      },
      files: initial.files as never,
      scrollToContent: true,
    };
  }, [initial, settings.gridMode, settings.snapMode, theme]);

  const persist = async (force: boolean) => {
    const api = apiRef.current;
    if (!api) return;
    if (!force && getSceneVersion(api.getSceneElementsIncludingDeleted()) === lastSavedVersion.current) return;
    // Uploads stamp firebaseUrl onto image elements, which bumps their version;
    // read the scene again afterwards so the saved elements carry the URLs.
    const leftover = await uploadPendingFiles(api);
    const elements = api.getSceneElementsIncludingDeleted();
    lastSavedVersion.current = getSceneVersion(elements);
    const drawing: DrawingData = {
      instanceId: initial.instanceId,
      elements: elements as unknown[],
      appState: serialisableState(api.getAppState() as unknown as Record<string, unknown>),
      files: filesToPersist(elements as unknown as ImageLikeElement[], { ...api.getFiles(), ...leftover }) as unknown as Record<string, unknown>,
      version: initial.version,
    };
    saving.current = saving.current.then(() => saveDrawing(uid, drawing)).then(
      () => onSaved(uid),
      (error) => console.error("[better-excalidraw] save failed", uid, error),
    );
    await saving.current;
  };

  const scheduleSave = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void persist(false);
    }, settings.autosaveDelayMs);
  };

  useEffect(() => {
    registerClose(async () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      await persist(true);
    });
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Excalidraw
      excalidrawAPI={(api) => {
        apiRef.current = api;
        void resolveFiles(initial.elements as ImageLikeElement[], api.getFiles()).then((files) => {
          const list = Object.values(files);
          if (list.length > 0 && apiRef.current === api) api.addFiles(list);
        });
      }}
      initialData={initialData as never}
      onChange={scheduleSave}
      theme={theme}
      langCode={settings.langCode}
      gridModeEnabled={undefined}
      UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
    />
  );
}

export function isEditorOpen(): boolean {
  return active !== null;
}

export function openEditor(uid: string, handlers: EditorHandlers): void {
  if (active) {
    if (active.uid === uid) {
      active.container.focus();
      return;
    }
    void closeEditor().then(() => openEditor(uid, handlers));
    return;
  }

  const initial = loadDrawing(uid);
  const container = document.createElement("div");
  container.className = "bex-modal";
  container.tabIndex = -1;
  container.classList.toggle("bex-dark", resolveTheme() === "dark");

  const bar = document.createElement("div");
  bar.className = "bex-modal-bar";
  const title = document.createElement("span");
  title.className = "bex-modal-title";
  title.textContent = "Better Excalidraw";
  const closeButton = document.createElement("button");
  closeButton.className = "bp3-button bp3-minimal bex-modal-close";
  closeButton.textContent = "Save & close";
  closeButton.onclick = () => void closeEditor();
  bar.append(title, closeButton);

  const canvas = document.createElement("div");
  canvas.className = "bex-modal-canvas";
  container.append(bar, canvas);
  document.body.append(container);

  let flush: () => Promise<void> = async () => {};
  const root = createRoot(canvas);
  root.render(
    <EditorView
      uid={uid}
      initial={initial}
      onSaved={handlers.onSaved}
      registerClose={(fn) => {
        flush = fn;
      }}
    />,
  );

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !event.defaultPrevented && event.target === container) {
      void closeEditor();
    }
  };
  container.addEventListener("keydown", onKeyDown);

  active = {
    uid,
    container,
    root,
    close: async () => {
      container.removeEventListener("keydown", onKeyDown);
      await flush();
      root.unmount();
      container.remove();
    },
  };
  container.focus();
}

export async function closeEditor(): Promise<void> {
  const current = active;
  if (!current) return;
  active = null;
  await current.close();
}
