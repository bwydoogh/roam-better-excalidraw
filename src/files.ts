// Image files in drawings. Mirrors Roam's native behaviour: the binary lives in
// Roam's file storage, the image element carries `customData.firebaseUrl`, and
// the block never stores data URLs unless an upload failed.
import type { BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

export interface ImageLikeElement {
  id: string;
  type: string;
  isDeleted?: boolean;
  fileId?: string | null;
  status?: string;
  customData?: Record<string, unknown>;
}

const byUrl = new Map<string, Promise<BinaryFileData | null>>();
const uploading = new Set<string>();

function isImage(el: ImageLikeElement): boolean {
  return el.type === "image" && !el.isDeleted && typeof el.fileId === "string";
}

function firebaseUrl(el: ImageLikeElement): string | null {
  const url = el.customData?.firebaseUrl;
  return typeof url === "string" && url.length > 0 ? url : null;
}

async function fetchFile(url: string, fileId: string): Promise<BinaryFileData | null> {
  try {
    const result = await window.roamAlphaAPI.file.get({ url, format: "base64" });
    if (!result || typeof result !== "object" || !("base64" in result)) return null;
    const mimeType = (result.mimetype || "image/png") as BinaryFileData["mimeType"];
    return {
      id: fileId as BinaryFileData["id"],
      mimeType,
      dataURL: `data:${mimeType};base64,${result.base64}` as BinaryFileData["dataURL"],
      created: Date.now(),
    };
  } catch (error) {
    console.warn("[better-excalidraw] file.get failed", url, error);
    return null;
  }
}

/** Files for every image element whose binary is not yet in `known`. */
export async function resolveFiles(elements: ImageLikeElement[], known: BinaryFiles): Promise<BinaryFiles> {
  const out: BinaryFiles = {};
  const tasks: Promise<void>[] = [];
  for (const el of elements) {
    if (!isImage(el)) continue;
    const fileId = el.fileId as string;
    if (known[fileId] || out[fileId]) continue;
    const url = firebaseUrl(el);
    if (!url) continue;
    let pending = byUrl.get(url);
    if (!pending) {
      pending = fetchFile(url, fileId);
      byUrl.set(url, pending);
    }
    tasks.push(pending.then((file) => {
      if (file) out[fileId] = { ...file, id: fileId as BinaryFileData["id"] };
      else byUrl.delete(url);
    }));
  }
  await Promise.all(tasks);
  return out;
}

function extractUrl(uploadResult: unknown): string | null {
  if (typeof uploadResult !== "string") return null;
  const match = /\((https?:\/\/[^)]+)\)/.exec(uploadResult);
  if (match) return match[1];
  return /^https?:\/\//.test(uploadResult) ? uploadResult.trim() : null;
}

async function dataUrlToFile(file: BinaryFileData): Promise<File> {
  const blob = await (await fetch(file.dataURL)).blob();
  const ext = (file.mimeType.split("/")[1] ?? "png").replace("svg+xml", "svg");
  return new File([blob], `${file.id}.${ext}`, { type: file.mimeType });
}

/**
 * Uploads every image that has no `customData.firebaseUrl` yet and stamps the
 * URL onto its element(s). Returns the files that still need to travel inside
 * the block (upload failed or in flight), keyed by fileId.
 */
export async function uploadPendingFiles(api: ExcalidrawImperativeAPI): Promise<BinaryFiles> {
  const elements = api.getSceneElementsIncludingDeleted() as unknown as ImageLikeElement[];
  const files = api.getFiles();
  const leftover: BinaryFiles = {};
  const urls = new Map<string, string>();

  await Promise.all(
    elements.filter(isImage).map(async (el) => {
      const fileId = el.fileId as string;
      if (firebaseUrl(el)) return;
      const file = files[fileId];
      if (!file) return;
      if (uploading.has(fileId)) {
        leftover[fileId] = file;
        return;
      }
      uploading.add(fileId);
      try {
        const result = await window.roamAlphaAPI.file.upload({ file: await dataUrlToFile(file), toast: { hide: true } });
        const url = extractUrl(result);
        if (url) {
          urls.set(fileId, url);
          byUrl.set(url, Promise.resolve(file));
        } else {
          leftover[fileId] = file;
        }
      } catch (error) {
        console.warn("[better-excalidraw] file.upload failed", fileId, error);
        leftover[fileId] = file;
      } finally {
        uploading.delete(fileId);
      }
    }),
  );

  if (urls.size > 0) {
    const updated = (api.getSceneElementsIncludingDeleted() as unknown as ImageLikeElement[]).map((el) => {
      const url = isImage(el) ? urls.get(el.fileId as string) : undefined;
      if (!url || firebaseUrl(el)) return el;
      return { ...el, status: "saved", customData: { ...(el.customData ?? {}), firebaseUrl: url } };
    });
    api.updateScene({ elements: updated as never, captureUpdate: CaptureUpdateAction.NEVER });
  }
  return leftover;
}

/** Files to persist in the block: only those without a storage URL. */
export function filesToPersist(elements: ImageLikeElement[], files: BinaryFiles): BinaryFiles {
  const out: BinaryFiles = {};
  for (const el of elements) {
    if (!isImage(el) || firebaseUrl(el)) continue;
    const file = files[el.fileId as string];
    if (file) out[el.fileId as string] = file;
  }
  return out;
}
