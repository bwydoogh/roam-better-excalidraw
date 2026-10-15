// Presentation: a Drawing's frames shown one at a time, full screen, in scene
// order. Pure slide logic only: no DOM, no Roam, no Excalidraw runtime. Tested.

export interface FrameLike {
  type: string;
  isDeleted?: boolean;
}

/** Element types that make a slide: frames, and AI frames where the nightly has them. */
const FRAME_TYPES = new Set(["frame", "magicframe"]);

/** The slides of a Drawing: its live frames, in scene element order. */
export function presentationFrames<T extends FrameLike>(elements: readonly T[]): T[] {
  return elements.filter((el) => FRAME_TYPES.has(el.type) && !el.isDeleted);
}

export type SlideMove = "next" | "previous" | "first" | "last";

/** The slide index after a move, clamped to the deck: no wrap-around at either end. */
export function moveSlide(index: number, count: number, move: SlideMove): number {
  if (count <= 0) return 0;
  const current = Math.min(Math.max(index, 0), count - 1);
  switch (move) {
    case "next":
      return Math.min(current + 1, count - 1);
    case "previous":
      return Math.max(current - 1, 0);
    case "first":
      return 0;
    case "last":
      return count - 1;
  }
}

const KEY_ACTIONS: Record<string, SlideMove | "leave"> = {
  ArrowRight: "next",
  ArrowDown: "next",
  " ": "next",
  PageDown: "next",
  ArrowLeft: "previous",
  ArrowUp: "previous",
  PageUp: "previous",
  Home: "first",
  End: "last",
  Escape: "leave",
};

/** What a key (`KeyboardEvent.key`) does during a Presentation; null when nothing. */
export function slideKeyAction(key: string): SlideMove | "leave" | null {
  return Object.hasOwn(KEY_ACTIONS, key) ? KEY_ACTIONS[key] : null;
}

/** The slide counter text, 1-based: "3 / 7". */
export function slideCounter(index: number, count: number): string {
  return count > 0 ? `${index + 1} / ${count}` : "";
}

/** The appState keys a Presentation changes; exactly these are restored when it ends. */
export const PRESENTATION_STATE_KEYS = ["viewModeEnabled", "zenModeEnabled", "frameRendering", "scrollX", "scrollY", "zoom", "scrollConstraints"] as const;

export type PresentationStateKey = (typeof PRESENTATION_STATE_KEYS)[number];

/** The pre-Presentation values of every key a Presentation changes. */
export function presentationRestoreState<T extends Partial<Record<PresentationStateKey, unknown>>>(appState: T): Pick<T, PresentationStateKey> {
  const out: Partial<Record<PresentationStateKey, unknown>> = {};
  for (const key of PRESENTATION_STATE_KEYS) {
    if (key in appState) out[key] = appState[key];
  }
  return out as Pick<T, PresentationStateKey>;
}
