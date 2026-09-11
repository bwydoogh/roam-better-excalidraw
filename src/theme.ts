import { isDarkTheme } from "./roam.ts";
import { getSettings } from "./settings.ts";

export function resolveTheme(): "light" | "dark" {
  const { theme } = getSettings();
  if (theme !== "auto") return theme;
  return isDarkTheme() ? "dark" : "light";
}
