// Bundles src/extension.ts (+ Excalidraw) into the two files Roam Depot ships:
// extension.js and extension.css. React is NOT bundled: Roam Depot mandates the
// host's window.React / window.ReactDOM (18.2), so every React import is
// rewritten to a tiny shim that reads those globals.
//
//   node tools/build.mjs           build
//   node tools/build.mjs --watch   rebuild on change
//   node tools/build.mjs --check   fail if the committed output has drifted
import { build, context } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const mode = process.argv[2] ?? "build";

const SHIMS = {
  react: `const R = window.React; if (!R) throw new Error("Better Excalidraw: window.React missing");
export default R;
export const { Children, Component, Fragment, PureComponent, StrictMode, Suspense, cloneElement, createContext, createElement, createRef, forwardRef, isValidElement, lazy, memo, startTransition, useCallback, useContext, useDebugValue, useDeferredValue, useEffect, useId, useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, useTransition, version } = R;`,
  "react-dom": `const D = window.ReactDOM; if (!D) throw new Error("Better Excalidraw: window.ReactDOM missing");
export default D;
export const { createPortal, findDOMNode, flushSync, hydrate, render, unmountComponentAtNode, unstable_batchedUpdates, version } = D;`,
  "react-dom/client": `const C = window.ReactDOMClient ?? window.ReactDOM;
if (!C?.createRoot) throw new Error("Better Excalidraw: window.ReactDOMClient missing");
export const createRoot = C.createRoot.bind(C);
export const hydrateRoot = C.hydrateRoot?.bind(C);
export default { createRoot, hydrateRoot };`,
  "react/jsx-runtime": `const R = window.React;
export const Fragment = R.Fragment;
export function jsx(type, props, key) {
  const { children, ...rest } = props ?? {};
  if (key !== undefined) rest.key = key;
  return children === undefined ? R.createElement(type, rest) : R.createElement(type, rest, children);
}
export function jsxs(type, props, key) {
  const { children, ...rest } = props ?? {};
  if (key !== undefined) rest.key = key;
  return R.createElement(type, rest, ...(Array.isArray(children) ? children : [children]));
}`,
};
SHIMS["react/jsx-dev-runtime"] = SHIMS["react/jsx-runtime"].replace("export function jsx(", "export function jsxDEV(") + "\nexport const jsx = jsxDEV;";

// Excalidraw lazy-loads two heavy optional pieces that a Roam user never needs:
// the Mermaid-to-Excalidraw converter (~3 MB) and ~50 UI locales (~1.5 MB).
// esbuild would inline them into extension.js, so they are replaced by stubs.
const KEPT_LOCALES = new Set(["en", "nl-NL", "fr-FR", "de-DE", "percentages"]);

const trimPlugin = {
  name: "trim-optional",
  setup(b) {
    b.onResolve({ filter: /^@excalidraw\/mermaid-to-excalidraw$/ }, (args) => ({ path: args.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: `export async function parseMermaidToExcalidraw() { throw new Error("Mermaid import is not bundled in Better Excalidraw"); }`,
      loader: "js",
    }));
    // Built locale files carry a content hash: ./locales/nl-NL-ABCDEFGH.js
    b.onResolve({ filter: /^\.\/locales\/[A-Za-z0-9-]+\.js$/ }, (args) => {
      const code = args.path.match(/locales\/([A-Za-z-]+?)(?:-[A-Z0-9]{8})?\.js$/)[1];
      if (KEPT_LOCALES.has(code)) return null;
      return { path: args.path, namespace: "locale-stub" };
    });
    b.onLoad({ filter: /.*/, namespace: "locale-stub" }, () => ({ contents: "export default {};", loader: "js" }));
    // Excalidraw's dist embeds its own (public) Firebase web config for collab
    // rooms. We never use collab, and the key trips GitHub secret scanning.
    b.onLoad({ filter: /@excalidraw\/excalidraw\/dist\/prod\/chunk-[A-Z0-9]+\.js$/ }, async (args) => {
      const source = await readFile(args.path, "utf8");
      if (!source.includes("VITE_APP_FIREBASE_CONFIG")) return null;
      return { contents: source.replace(/VITE_APP_FIREBASE_CONFIG:'[^']*'/, "VITE_APP_FIREBASE_CONFIG:'{}'"), loader: "js" };
    });
  },
};

const reactShimPlugin = {
  name: "react-host-shim",
  setup(b) {
    b.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/ }, (args) => ({
      path: args.path,
      namespace: "react-shim",
    }));
    b.onLoad({ filter: /.*/, namespace: "react-shim" }, (args) => ({
      contents: SHIMS[args.path],
      loader: "js",
    }));
  },
};

const options = {
  entryPoints: [resolve(root, "src/extension.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  outfile: resolve(root, "extension.js"),
  legalComments: "none",
  minify: mode !== "watch",
  sourcemap: false,
  logLevel: "info",
  conditions: ["production", "browser"],
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl", ".svg": "dataurl" },
  banner: {
    js: "// GENERATED by tools/build.mjs from src/ — do not edit. Better Excalidraw for Roam Research.",
    css: "/* GENERATED by tools/build.mjs from src/ — do not edit. */",
  },
  plugins: [trimPlugin, reactShimPlugin],
};

function hashFile(path) {
  return existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null;
}

if (mode === "--watch") {
  const ctx = await context(options);
  await ctx.watch();
  console.log("watching src/ …");
} else if (mode === "--check") {
  const before = { js: hashFile(options.outfile), css: hashFile(options.outfile.replace(/\.js$/, ".css")) };
  await build({ ...options, write: false, logLevel: "silent" }).then((result) => {
    for (const file of result.outputFiles) {
      const key = file.path.endsWith(".css") ? "css" : "js";
      const fresh = createHash("sha256").update(file.contents).digest("hex");
      if (fresh !== before[key]) {
        console.error(`build drift: committed ${key} differs from src/. Run npm run build.`);
        process.exit(1);
      }
    }
  });
  console.log("build up to date");
} else {
  await build(options);
}
