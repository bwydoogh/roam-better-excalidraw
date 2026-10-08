import { getSettings } from "./settings.ts";

export function resolveTheme(): "light" | "dark" {
  const { theme } = getSettings();
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Follow changes without reopening the Editor; only notify when its theme changes. */
export function watchTheme(onChange: (theme: "light" | "dark") => void): () => void {
  let current = resolveTheme();
  const update = () => {
    const next = resolveTheme();
    if (next === current) return;
    current = next;
    onChange(next);
  };
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}

const SURFACE_SELECTORS = [".roam-body-main", ".roam-article", ".roam-app", ".roam-body", "body"];
const TRANSPARENT = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)$|^transparent$/;

/**
 * Roam's own surface colours as it currently renders them, so overlays can
 * blend in with whatever theme (or system light/dark) is active rather than
 * hardcoding white or near-black. Walks from the main content area outwards
 * to the first element with an opaque background.
 */
export function roamSurfaceColors(): { background: string; color: string } {
  let background = "";
  let color = "";
  for (const selector of SURFACE_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) continue;
    const style = getComputedStyle(el);
    if (!color) color = style.color;
    if (!background && !TRANSPARENT.test(style.backgroundColor)) background = style.backgroundColor;
    if (background && color) break;
  }
  return { background: background || "#fff", color: color || "#182026" };
}
