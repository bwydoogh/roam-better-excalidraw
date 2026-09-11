// The on-block storage schema, copied from Roam's native Excalidraw block
// (see docs/adr/0001). Pure: no DOM, no Roam API. Tested by tools/test-logic.mjs.

export const SCHEMA_VERSION = "0.18.0";

const FIELDS = ["instance-id", "elements-json", "state-json", "files-json", "version"] as const;
type Field = (typeof FIELDS)[number];

const canonicalKey = (field: Field) => `excalidraw/${field}`;

/** Every spelling under which Roam may hand a props key back to us. */
function keyVariants(field: Field): string[] {
  return [`excalidraw/${field}`, `:excalidraw/${field}`, field, `:${field}`];
}

export interface DrawingData {
  instanceId: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  version: string;
}

function readField(props: Record<string, unknown>, field: Field): unknown {
  for (const key of keyVariants(field)) {
    if (key in props) return props[key];
  }
  return undefined;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Reads a drawing from a block's props. Missing props yield an empty drawing. */
export function readDrawing(props: Record<string, unknown> | null | undefined): DrawingData {
  const p = props ?? {};
  return {
    instanceId: String(readField(p, "instance-id") ?? ""),
    elements: parseJson<unknown[]>(readField(p, "elements-json"), []),
    appState: parseJson<Record<string, unknown>>(readField(p, "state-json"), {}),
    files: parseJson<Record<string, unknown>>(readField(p, "files-json"), {}),
    version: String(readField(p, "version") ?? SCHEMA_VERSION),
  };
}

export function hasDrawingProps(props: Record<string, unknown> | null | undefined): boolean {
  return props != null && readField(props, "elements-json") !== undefined;
}

/**
 * Merges a drawing into an existing props map. Roam replaces the whole map on
 * write, so unrelated props (image sizes, other components) are carried over,
 * and every spelling of our own keys is dropped before the canonical ones go in.
 */
export function mergeDrawingProps(
  existing: Record<string, unknown> | null | undefined,
  drawing: DrawingData,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const ours = new Set(FIELDS.flatMap(keyVariants));
  for (const [key, value] of Object.entries(existing ?? {})) {
    if (!ours.has(key)) out[key] = value;
  }
  out[canonicalKey("instance-id")] = drawing.instanceId;
  out[canonicalKey("elements-json")] = JSON.stringify(drawing.elements);
  out[canonicalKey("state-json")] = JSON.stringify(drawing.appState);
  out[canonicalKey("files-json")] = JSON.stringify(drawing.files);
  out[canonicalKey("version")] = drawing.version || SCHEMA_VERSION;
  return out;
}
