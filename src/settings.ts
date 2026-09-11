import type { ExtensionAPI } from "./roam-types.d.ts";

export type ThemeSetting = "auto" | "light" | "dark";

export interface Settings {
  maxPreviewHeight: number;
  theme: ThemeSetting;
  autosaveDelayMs: number;
  langCode: string;
  gridMode: boolean;
}

const DEFAULTS: Settings = {
  maxPreviewHeight: 500,
  theme: "auto",
  autosaveDelayMs: 1000,
  langCode: "en",
  gridMode: false,
};

let api: ExtensionAPI | null = null;

export function initSettings(extensionAPI: ExtensionAPI): void {
  api = extensionAPI;
  extensionAPI.settings.panel.create({
    tabTitle: "Better Excalidraw",
    settings: [
      {
        id: "maxPreviewHeight",
        name: "Maximum preview height (px)",
        description: "Previews use the drawing's natural height up to this limit. Override per block with {{better-excalidraw: height=400}}.",
        action: { type: "input", placeholder: String(DEFAULTS.maxPreviewHeight) },
      },
      {
        id: "theme",
        name: "Theme",
        description: "auto follows Roam's theme.",
        action: { type: "select", items: ["auto", "light", "dark"] },
      },
      {
        id: "autosaveDelayMs",
        name: "Autosave delay (ms)",
        description: "How long to wait after the last change before writing to the graph.",
        action: { type: "input", placeholder: String(DEFAULTS.autosaveDelayMs) },
      },
      {
        id: "langCode",
        name: "Editor language",
        description: "Excalidraw UI language code, e.g. en, nl, fr, de.",
        action: { type: "input", placeholder: DEFAULTS.langCode },
      },
      {
        id: "gridMode",
        name: "Grid on by default",
        description: "Open the editor with the grid enabled.",
        action: { type: "switch" },
      },
    ],
  });
}

function number(key: keyof Settings, fallback: number): number {
  const raw = api?.settings.get(key);
  const value = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getSettings(): Settings {
  const theme = api?.settings.get("theme");
  const lang = api?.settings.get("langCode");
  return {
    maxPreviewHeight: number("maxPreviewHeight", DEFAULTS.maxPreviewHeight),
    theme: theme === "light" || theme === "dark" ? theme : "auto",
    autosaveDelayMs: number("autosaveDelayMs", DEFAULTS.autosaveDelayMs),
    langCode: typeof lang === "string" && lang.trim() ? lang.trim() : DEFAULTS.langCode,
    gridMode: api?.settings.get("gridMode") === true,
  };
}
