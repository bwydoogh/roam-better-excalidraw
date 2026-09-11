// Minimal typings for the parts of Roam's runtime this extension touches.
// Roam ships no official .d.ts; everything here is observed behaviour.

export interface RoamPullBlock {
  ":block/uid"?: string;
  ":block/string"?: string;
  ":block/props"?: Record<string, unknown>;
  ":block/children"?: Array<{ ":block/uid": string; ":block/order"?: number }>;
}

export interface RoamFocusedBlock {
  "block-uid": string;
  "window-id": string;
}

export interface ExtensionSettingsAPI {
  get(key: string): unknown;
  set(key: string, value: unknown): Promise<void>;
  panel: { create(config: unknown): void };
}

export interface ExtensionAPI {
  settings: ExtensionSettingsAPI;
}

declare global {
  interface Window {
    React: typeof import("react");
    ReactDOM: typeof import("react-dom");
    ReactDOMClient?: typeof import("react-dom/client");
    roamAlphaAPI: {
      pull(pattern: string, eid: unknown): RoamPullBlock | null;
      q(query: string, ...inputs: unknown[]): unknown[][];
      util: { generateUID(): string };
      file: {
        upload(args: { file: File; toast?: { hide?: boolean } }): Promise<string>;
        get(args: { url: string; format?: "base64" }): Promise<File | { base64: string; filename?: string; mimetype?: string }>;
        delete(args: { url: string }): Promise<void>;
      };
      data: {
        block: {
          update(args: { block: { uid: string; string?: string; props?: Record<string, unknown> } }): Promise<void>;
          create(args: { location: { "parent-uid": string; order: number | "last" }; block: { uid?: string; string: string; props?: Record<string, unknown> } }): Promise<void>;
        };
        addPullWatch(pattern: string, eid: string, cb: (before: RoamPullBlock | null, after: RoamPullBlock | null) => void): void;
        removePullWatch(pattern: string, eid: string, cb: (before: RoamPullBlock | null, after: RoamPullBlock | null) => void): void;
      };
      ui: {
        getFocusedBlock(): RoamFocusedBlock | null;
        commandPalette: {
          addCommand(cmd: { label: string; callback: () => void; "disable-hotkey"?: boolean }): void;
          removeCommand(cmd: { label: string }): void;
        };
      };
    };
    __betterExcalidrawCleanup?: () => void;
  }
}

export {};
