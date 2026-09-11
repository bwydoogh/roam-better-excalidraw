import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMirror,
  isDrawingBlock,
  isNativeDrawingBlock,
  parseOptions,
  toBetterExcalidraw,
  toNativeExcalidraw,
  unsupportedNativeTypes,
  withMirror,
} from "../src/blockString.ts";
import { hasDrawingProps, mergeDrawingProps, readDrawing } from "../src/schema.ts";
import { escapeClosesEditor } from "../src/editorKeys.ts";
import { findRoamLinks, textUnderPointer } from "../src/links.ts";

const NATIVE = '{{[[excalidraw]]}} {{-: Text elements in drawing: Gitlab ; Push tag ; start "automated\ndeployment" }}';

test("detects drawing blocks", () => {
  assert.equal(isDrawingBlock("{{better-excalidraw}}"), true);
  assert.equal(isDrawingBlock("{{better-excalidraw: height=400}}"), true);
  assert.equal(isDrawingBlock(NATIVE), false);
  assert.equal(isNativeDrawingBlock(NATIVE), true);
  assert.equal(isNativeDrawingBlock("{{excalidraw}}"), true);
  assert.equal(isNativeDrawingBlock("[[excalidraw]]"), false);
});

test("parses height and width overrides", () => {
  assert.deepEqual(parseOptions("{{better-excalidraw}}"), {});
  assert.deepEqual(parseOptions("{{better-excalidraw: height=400}}"), { height: 400 });
  assert.deepEqual(parseOptions("{{better-excalidraw: width=300}}"), { width: 300 });
  assert.deepEqual(parseOptions("{{better-excalidraw: width=300, height=200}}"), { width: 300, height: 200 });
  assert.deepEqual(parseOptions("{{better-excalidraw: height=200 width=300}}"), { width: 300, height: 200 });
  assert.deepEqual(parseOptions("{{better-excalidraw:height=abc}}"), {});
  assert.deepEqual(parseOptions("{{better-excalidraw: width=-5 depth=3}}"), {});
});

test("builds the mirror in the native format", () => {
  const elements = [
    { type: "text", text: "Gitlab", originalText: "Gitlab" },
    { type: "rectangle" },
    { type: "text", text: "a\nb", originalText: "a b" },
    { type: "text", text: "gone", isDeleted: true },
    { type: "text", text: "   " },
    { type: "text", text: "x }} y" },
  ];
  assert.equal(buildMirror(elements), "{{-: Text elements in drawing: Gitlab ; a b ; x } } y }}");
  assert.equal(buildMirror([{ type: "rectangle" }]), "");
});

test("withMirror keeps caption and tags, replaces only the mirror", () => {
  const text = "{{better-excalidraw}} {{-: Text elements in drawing: old }} deploy schema #diagram";
  const updated = withMirror(text, "{{-: Text elements in drawing: new }}");
  assert.equal(updated, "{{better-excalidraw}} {{-: Text elements in drawing: new }} deploy schema #diagram");
  assert.equal(withMirror(updated, ""), "{{better-excalidraw}} deploy schema #diagram");
  assert.equal(withMirror("{{better-excalidraw}}", "{{-: Text elements in drawing: a }}"), "{{better-excalidraw}} {{-: Text elements in drawing: a }}");
  assert.equal(withMirror("caption {{better-excalidraw: height=200}} tail", "{{-: Text elements in drawing: a }}"), "caption {{better-excalidraw: height=200}} {{-: Text elements in drawing: a }} tail");
});

test("withMirror survives a mirror that contains newlines", () => {
  const updated = withMirror(NATIVE, "{{-: Text elements in drawing: new }}");
  assert.equal(updated, "{{[[excalidraw]]}} {{-: Text elements in drawing: new }}");
});

test("convert is a one-word swap in both directions", () => {
  const better = toBetterExcalidraw(NATIVE);
  assert.equal(better.startsWith("{{better-excalidraw}} {{-: "), true);
  assert.equal(toNativeExcalidraw(better), NATIVE);
  assert.equal(toNativeExcalidraw("{{better-excalidraw: height=300}} x"), "{{[[excalidraw]]}} x");
  assert.equal(toBetterExcalidraw("plain text"), "plain text");
});

test("readDrawing accepts every key spelling", () => {
  for (const prefix of ["excalidraw/", ":excalidraw/", "", ":"]) {
    const d = readDrawing({ [`${prefix}elements-json`]: '[{"type":"text"}]', [`${prefix}instance-id`]: "abc" });
    assert.deepEqual(d.elements, [{ type: "text" }]);
    assert.equal(d.instanceId, "abc");
    assert.equal(d.version, "0.18.0");
  }
  assert.deepEqual(readDrawing(undefined).elements, []);
  assert.deepEqual(readDrawing({ "excalidraw/elements-json": "not json" }).elements, []);
  assert.equal(hasDrawingProps({ "image-size": 1 }), false);
  assert.equal(hasDrawingProps({ "elements-json": "[]" }), true);
});

test("mergeDrawingProps keeps foreign props and dedupes ours", () => {
  const merged = mergeDrawingProps(
    { "image-size": { w: 1 }, "elements-json": "[]", ":excalidraw/state-json": "{}" },
    { instanceId: "id", elements: [1], appState: { a: 1 }, files: {}, version: "0.18.0" },
  );
  assert.deepEqual(Object.keys(merged).sort(), [
    "excalidraw/elements-json",
    "excalidraw/files-json",
    "excalidraw/instance-id",
    "excalidraw/state-json",
    "excalidraw/version",
    "image-size",
  ]);
  assert.equal(merged["excalidraw/elements-json"], "[1]");
});

test("findRoamLinks recognises pages, tags and block refs", () => {
  assert.deepEqual(findRoamLinks("see [[Project X]] and #todo and #[[multi word]] then ((abcdefghi))"), [
    { kind: "page", target: "Project X" },
    { kind: "page", target: "todo" },
    { kind: "page", target: "multi word" },
    { kind: "block", target: "abcdefghi" },
  ]);
  assert.deepEqual(findRoamLinks("plain text"), []);
  assert.deepEqual(findRoamLinks("C# is not a tag"), []);
});

test("textUnderPointer follows a container to its label", () => {
  const label = { id: "t", type: "text", text: "[[A]]", originalText: "[[A]]" };
  const box = { id: "r", type: "rectangle", boundElements: [{ id: "t", type: "text" }] };
  const state = (element) => ({ hit: { element } });
  assert.equal(textUnderPointer(state(label), [label, box]), "[[A]]");
  assert.equal(textUnderPointer(state(box), [label, box]), "[[A]]");
  assert.equal(textUnderPointer(state({ id: "x", type: "ellipse" }), [label, box]), null);
  assert.equal(textUnderPointer(state(null), []), null);
});

test("unsupportedNativeTypes flags only live, non-native element types", () => {
  assert.deepEqual(unsupportedNativeTypes([{ type: "rectangle" }, { type: "text" }, { type: "image" }]), []);
  assert.deepEqual(unsupportedNativeTypes([{ type: "stickynote" }, { type: "video" }, { type: "stickynote" }, { type: "document", isDeleted: true }]), ["stickynote", "video"]);
});

test("escapeClosesEditor only when Excalidraw has nothing to dismiss", () => {
  const idle = {
    activeTool: { type: "selection" },
    preferredSelectionTool: { type: "selection" },
    selectedElementIds: {},
    openSidebar: null,
    openDialog: null,
    showHyperlinkPopup: false,
  };
  assert.equal(escapeClosesEditor(idle, ["a"]), true);
  assert.equal(escapeClosesEditor({}, []), true);
  // A selection, a drawing tool or text editing: Escape belongs to Excalidraw.
  assert.equal(escapeClosesEditor({ ...idle, selectedElementIds: { a: true } }, ["a"]), false);
  assert.equal(escapeClosesEditor({ ...idle, activeTool: { type: "rectangle" } }, []), false);
  assert.equal(escapeClosesEditor({ ...idle, editingTextElement: { id: "t" } }, []), false);
  assert.equal(escapeClosesEditor({ ...idle, openDialog: { name: "help" } }, []), false);
  assert.equal(escapeClosesEditor({ ...idle, showHyperlinkPopup: "editor" }, []), false);
  // The lasso as preferred selection tool is the resting tool, not a drawing tool.
  assert.equal(escapeClosesEditor({ ...idle, activeTool: { type: "lasso" }, preferredSelectionTool: { type: "lasso" } }, []), true);
  // A stale selection of a deleted element does not block closing.
  assert.equal(escapeClosesEditor({ ...idle, selectedElementIds: { gone: true } }, ["a"]), true);
  // Sidebars: search and an undocked Library close on Escape, a docked Library stays.
  assert.equal(escapeClosesEditor({ ...idle, openSidebar: { name: "default", tab: "search" }, defaultSidebarDockedPreference: true }, []), false);
  assert.equal(escapeClosesEditor({ ...idle, openSidebar: { name: "default", tab: "library" } }, []), false);
  assert.equal(escapeClosesEditor({ ...idle, openSidebar: { name: "default", tab: "library" }, defaultSidebarDockedPreference: true }, []), true);
});
