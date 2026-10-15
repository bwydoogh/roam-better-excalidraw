// The Editor: a full-size modal hosting Excalidraw, autosaving to the block.
// At most one Editor is open at a time; opening a second focuses the first.
import { CaptureUpdateAction, Excalidraw, exportToBlob, getSceneVersion, restoreAppState, restoreElements } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI, PointerDownState } from "@excalidraw/excalidraw/types";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { filesToPersist, resolveFiles, uploadPendingFiles, type ImageLikeElement } from "./files.ts";
import { loadLibrary, saveLibrary } from "./library.ts";
import { findRoamLinks, textUnderPointer } from "./links.ts";
import { moveSlide, presentationFrames, presentationRestoreState, slideCounter, slideKeyAction, type FrameLike, type PresentationStateKey, type SlideMove } from "./presentation.ts";
import { insertImageChild, loadDrawing, openInMainWindow, openInSidebar, pageUidByTitle, saveDrawing } from "./roam.ts";
import type { DrawingData } from "./schema.ts";
import { getSettings } from "./settings.ts";
import { resolveTheme, watchTheme } from "./theme.ts";

interface ActiveEditor {
  uid: string;
  container: HTMLElement;
  root: Root;
  api: () => ExcalidrawImperativeAPI | null;
  close: () => Promise<void>;
}

async function insertAsImage(uid: string, button: HTMLButtonElement): Promise<void> {
  const api = active?.api();
  if (!api || active?.uid !== uid) return;
  button.disabled = true;
  try {
    const blob = await exportToBlob({
      elements: api.getSceneElements(),
      appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false },
      files: api.getFiles(),
      mimeType: "image/png",
      exportPadding: 16,
      getDimensions: (w: number, h: number) => ({ width: w * 2, height: h * 2, scale: 2 }),
    });
    await insertImageChild(uid, blob);
    button.textContent = "Image inserted";
  } catch (error) {
    console.error("[better-excalidraw] insert as image failed", error);
    button.textContent = "Insert failed";
  } finally {
    window.setTimeout(() => {
      button.textContent = "Insert as image";
      button.disabled = false;
    }, 2000);
  }
}

let active: ActiveEditor | null = null;

export interface EditorHandlers {
  onSaved(uid: string): void;
}

interface EditorProps {
  uid: string;
  container: HTMLElement;
  initial: DrawingData;
  onSaved(uid: string): void;
  registerClose(fn: () => Promise<void>): void;
  registerApi(api: ExcalidrawImperativeAPI): void;
  presentation: PresentationControl;
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

function resolveLink(link: { kind: "page" | "block"; target: string }): string | null {
  return link.kind === "block" ? link.target : pageUidByTitle(link.target);
}

/**
 * Shift+click on a text (or a labelled shape) containing a Roam link opens it
 * in the right sidebar; Cmd/Ctrl+click closes the Editor and navigates there.
 */
function followLink(api: ExcalidrawImperativeAPI, state: PointerDownState, event: PointerEvent): void {
  if (!event.shiftKey && !state.withCmdOrCtrl) return;
  if (state.drag.hasOccurred) return;
  const text = textUnderPointer(state, api.getSceneElements() as never);
  if (!text) return;
  const link = findRoamLinks(text)[0];
  if (!link) return;
  const target = resolveLink(link);
  if (!target) return;
  if (event.shiftKey) openInSidebar(target);
  else void closeEditor().then(() => openInMainWindow(target));
}

function EditorView({ uid, container, initial, onSaved, registerClose, registerApi, presentation }: EditorProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const lastSavedVersion = useRef<number>(getSceneVersion(initial.elements as never));
  // Excalidraw applies initialData asynchronously after mount and fires
  // onChange with an empty scene in the meantime. Nothing may be saved until
  // the stored scene has actually been loaded.
  const sceneReady = useRef<boolean>(initial.elements.length === 0);
  const timer = useRef<number | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const settings = useMemo(() => getSettings(), []);
  const initialTheme = useMemo(() => resolveTheme(), []);
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    const apply = (next: "light" | "dark") => {
      container.classList.toggle("bex-dark", next === "dark");
      setTheme(next);
    };
    const unwatch = watchTheme(apply);
    apply(resolveTheme());
    return unwatch;
  }, [container]);

  const initialData = useMemo(() => {
    const appState = restoreAppState(initial.appState as never, null);
    return {
      elements: restoreElements(initial.elements as never, null),
      appState: {
        ...appState,
        gridModeEnabled: settings.gridMode || appState.gridModeEnabled,
        objectsSnapModeEnabled: settings.snapMode || appState.objectsSnapModeEnabled,
        theme: initialTheme,
        collaborators: new Map(),
      },
      files: initial.files as never,
      scrollToContent: true,
    };
  }, [initial, settings.gridMode, settings.snapMode, initialTheme]);

  const persist = async (force: boolean) => {
    const api = apiRef.current;
    if (!api || !sceneReady.current) return;
    if (!force && getSceneVersion(api.getSceneElementsIncludingDeleted()) === lastSavedVersion.current) return;
    // A scene with no elements at all (not even deleted markers) while the
    // block had elements is a load failure, never a user action: deleting in
    // Excalidraw leaves isDeleted elements behind.
    if (initial.elements.length > 0 && api.getSceneElementsIncludingDeleted().length === 0) {
      console.warn("[better-excalidraw] refusing to overwrite a drawing with an empty scene", uid);
      return;
    }
    // Uploads stamp firebaseUrl onto image elements, which bumps their version;
    // read the scene again afterwards so the saved elements carry the URLs.
    const leftover = await uploadPendingFiles(api);
    const elements = api.getSceneElementsIncludingDeleted();
    lastSavedVersion.current = getSceneVersion(elements);
    const drawing: DrawingData = {
      instanceId: initial.instanceId,
      elements: elements as unknown[],
      // During a Presentation the pre-Presentation view mode, zen mode, frame
      // rendering and scroll/zoom are saved instead of the Presentation's own.
      appState: serialisableState({ ...api.getAppState(), ...presentation.restoreState() } as unknown as Record<string, unknown>),
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
    if (!sceneReady.current) {
      const api = apiRef.current;
      if (!api) return;
      const elements = api.getSceneElementsIncludingDeleted();
      if (elements.length === 0) return;
      sceneReady.current = true;
      lastSavedVersion.current = getSceneVersion(elements);
      return;
    }
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
      onExcalidrawAPI={(api) => {
        if (!api) return;
        apiRef.current = api;
        registerApi(api);
        api.onPointerUp((_tool, state, event) => followLink(api, state, event));
        void resolveFiles(initial.elements as ImageLikeElement[], api.getFiles()).then((files) => {
          const list = Object.values(files);
          if (list.length > 0 && apiRef.current === api) api.addFiles(list);
        });
      }}
      initialData={{ ...initialData, libraryItems: loadLibrary() } as never}
      onChange={(elements) => {
        presentation.sceneChanged(elements);
        scheduleSave();
      }}
      onLibraryChange={(items) => saveLibrary(items)}
      theme={theme}
      langCode={settings.langCode}
      gridModeEnabled={undefined}
      UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
    />
  );
}

/**
 * Keeps Roam's right sidebar visible while the Editor is open: the modal
 * gives up exactly the sidebar's width and follows it as the user resizes or
 * closes it. Excalidraw re-fits its canvas through its own ResizeObserver.
 */
const SIDEBAR_SELECTORS = ["#right-sidebar", "#roam-right-sidebar-content", ".rm-sidebar-outline", ".sidebar-content"];

function findSidebar(): HTMLElement | null {
  for (const selector of SIDEBAR_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
  }
  return null;
}

function fitBesideSidebar(container: HTMLElement): () => void {
  let watched: HTMLElement | null = null;
  let resize: ResizeObserver | null = null;
  const apply = () => {
    const sidebar = findSidebar();
    if (sidebar !== watched) {
      resize?.disconnect();
      watched = sidebar;
      if (sidebar) {
        resize = new ResizeObserver(apply);
        resize.observe(sidebar);
      }
    }
    const rect = sidebar?.getBoundingClientRect();
    // Roam's sidebar sits at the right edge; take whatever it occupies there.
    const width = rect && rect.width > 40 && rect.right > window.innerWidth - 4 ? window.innerWidth - rect.left : 0;
    container.style.right = width > 0 ? `${Math.round(width)}px` : "";
    container.classList.toggle("bex-beside-sidebar", width > 0);
  };
  // The sidebar element is created when first opened, so watch the body too.
  const mutation = new MutationObserver(apply);
  mutation.observe(document.body, { childList: true, subtree: false, attributes: true, attributeFilter: ["class", "style"] });
  const app = document.querySelector(".roam-app") ?? document.body;
  const appMutation = new MutationObserver(apply);
  appMutation.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
  window.addEventListener("resize", apply);
  apply();
  return () => {
    resize?.disconnect();
    mutation.disconnect();
    appMutation.disconnect();
    window.removeEventListener("resize", apply);
  };
}

/** The Presentation of the open Editor: the Drawing's frames, one per slide, full screen. */
interface PresentationControl {
  /** Pre-Presentation appState to persist instead of the Presentation's own; null when not presenting. */
  restoreState(): Pick<AppState, PresentationStateKey> | null;
  /** True just after a Presentation ended, so the Escape that ended it cannot also close the Editor. */
  swallowsEscape(): boolean;
  sceneChanged(elements: readonly FrameLike[]): void;
  start(): Promise<void>;
  stop(): void;
}

/** Room around a frame when it is fitted to the screen, in screen pixels. */
const SLIDE_MARGIN = 16;
/** How long after a Presentation ends an Escape is still taken as the one that ended it. */
const ESCAPE_GRACE_MS = 500;

function createPresentation(container: HTMLElement, getApi: () => ExcalidrawImperativeAPI | null, button: HTMLButtonElement, counter: HTMLElement): PresentationControl {
  let saved: Pick<AppState, PresentationStateKey> | null = null;
  let index = 0;
  let endedAt = -Infinity;
  let hasFrames: boolean | null = null;
  let refit: number | null = null;

  const show = (move: SlideMove | null, animate: boolean) => {
    const api = getApi();
    if (!api || saved === null) return;
    // Read the frames on every step: the scene is the only source of slides.
    const frames = presentationFrames(api.getSceneElements());
    if (frames.length === 0) return stop();
    index = move ? moveSlide(index, frames.length, move) : Math.min(index, frames.length - 1);
    api.setViewport({ target: frames[index], fit: "contain", animation: animate, offsets: { top: SLIDE_MARGIN, right: SLIDE_MARGIN, bottom: SLIDE_MARGIN, left: SLIDE_MARGIN } });
    counter.textContent = slideCounter(index, frames.length);
  };

  // Every key aimed at the Presentation belongs to it: nothing reaches
  // Excalidraw, Roam or the Editor's own Escape handler while it runs. Keys
  // aimed elsewhere (Roam's sidebar when full screen was refused) pass untouched.
  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as Node | null;
    if (target && target !== document.body && !container.contains(target)) return;
    event.stopImmediatePropagation();
    const action = slideKeyAction(event.key);
    if (!action || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    if (action === "leave") stop();
    else show(action, true);
  };

  const onFullscreenChange = () => {
    if (document.fullscreenElement !== container) stop();
  };

  // Hiding the bar, entering full screen or resizing the window changes the
  // canvas size: fit the current frame again once Excalidraw has measured it.
  const resize = new ResizeObserver(() => refitSoon());
  const refitSoon = () => {
    if (refit !== null) window.cancelAnimationFrame(refit);
    refit = window.requestAnimationFrame(() => {
      refit = window.requestAnimationFrame(() => {
        refit = null;
        show(null, false);
      });
    });
  };

  const stop = () => {
    if (saved === null) return;
    const restore = saved;
    saved = null;
    endedAt = performance.now();
    window.removeEventListener("keydown", onKeyDown, true);
    resize.disconnect();
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    if (refit !== null) window.cancelAnimationFrame(refit);
    refit = null;
    container.classList.remove("bex-presenting");
    counter.textContent = "";
    const api = getApi();
    if (api && !api.isDestroyed) {
      // Synchronous, so the next read of appState (an autosave, the final
      // save on close) already sees the restored values.
      flushSync(() => {
        api.setViewport(null);
        api.updateScene({ appState: restore, captureUpdate: CaptureUpdateAction.NEVER });
      });
    }
    if (document.fullscreenElement === container) void document.exitFullscreen().catch(() => {});
    container.focus();
  };

  const start = async () => {
    const api = getApi();
    if (!api || saved !== null) return;
    if (presentationFrames(api.getSceneElements()).length === 0) return;
    saved = presentationRestoreState(api.getAppState());
    index = 0;
    container.classList.add("bex-presenting");
    container.focus();
    window.addEventListener("keydown", onKeyDown, true);
    resize.observe(container);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    api.updateScene({
      appState: { viewModeEnabled: true, zenModeEnabled: true, frameRendering: { enabled: true, name: false, outline: false, clip: true } },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    counter.textContent = slideCounter(0, presentationFrames(api.getSceneElements()).length);
    try {
      await container.requestFullscreen();
    } catch (error) {
      // Without full screen the Presentation still runs inside the modal.
      console.warn("[better-excalidraw] full screen refused", error);
    }
    // Left before full screen was granted: do not stay full screen without it.
    if (saved === null && document.fullscreenElement === container) void document.exitFullscreen().catch(() => {});
  };

  return {
    restoreState: () => saved,
    swallowsEscape: () => saved !== null || performance.now() - endedAt < ESCAPE_GRACE_MS,
    sceneChanged(elements) {
      const next = presentationFrames(elements).length > 0;
      if (next === hasFrames) return;
      hasFrames = next;
      button.disabled = !next;
      button.title = next ? "Show this drawing's frames one at a time, full screen (Escape to leave)" : "Add a frame to the drawing to present it";
    },
    start,
    stop,
  };
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
  title.textContent = `Better Excalidraw · ${__BUILD_STAMP__}`;
  const actions = document.createElement("div");
  actions.className = "bex-modal-actions";
  const imageButton = document.createElement("button");
  imageButton.className = "bp3-button bp3-minimal";
  imageButton.textContent = "Insert as image";
  imageButton.title = "Upload a PNG of this drawing and add it as a child block";
  imageButton.onclick = () => void insertAsImage(uid, imageButton);
  const presentButton = document.createElement("button");
  presentButton.className = "bp3-button bp3-minimal";
  presentButton.textContent = "Present";
  const closeButton = document.createElement("button");
  closeButton.className = "bp3-button bp3-minimal bex-modal-close";
  closeButton.textContent = "Save & close";
  closeButton.onclick = () => void closeEditor();
  actions.append(presentButton, imageButton, closeButton);
  bar.append(title, actions);

  const canvas = document.createElement("div");
  canvas.className = "bex-modal-canvas";
  const counter = document.createElement("div");
  counter.className = "bex-presentation-counter";
  counter.setAttribute("aria-live", "polite");
  container.append(bar, canvas, counter);
  document.body.append(container);

  let flush: () => Promise<void> = async () => {};
  let editorApi: ExcalidrawImperativeAPI | null = null;
  const presentation = createPresentation(container, () => editorApi, presentButton, counter);
  presentation.sceneChanged(initial.elements as FrameLike[]);
  presentButton.onclick = () => void presentation.start();
  const root = createRoot(canvas);
  root.render(
    <EditorView
      uid={uid}
      container={container}
      initial={initial}
      onSaved={handlers.onSaved}
      registerClose={(fn) => {
        flush = fn;
      }}
      registerApi={(api) => {
        editorApi = api;
      }}
      presentation={presentation}
    />,
  );

  const unfit = fitBesideSidebar(container);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !event.defaultPrevented && event.target === container && !presentation.swallowsEscape()) {
      void closeEditor();
    }
  };
  container.addEventListener("keydown", onKeyDown);

  active = {
    uid,
    container,
    root,
    api: () => editorApi,
    close: async () => {
      unfit();
      container.removeEventListener("keydown", onKeyDown);
      // Restores the pre-Presentation appState first, so the final save writes
      // it; a failure here must not cost the final save.
      try {
        presentation.stop();
      } catch (error) {
        console.error("[better-excalidraw] leaving the presentation failed", uid, error);
      }
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
