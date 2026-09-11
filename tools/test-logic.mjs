import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMirror,
  captionOf,
  drawingIndexEntries,
  isDrawingBlock,
  isNativeDrawingBlock,
  matchesIndexFilter,
  parseOptions,
  toBetterExcalidraw,
  toNativeExcalidraw,
  unsupportedNativeTypes,
  withMirror,
} from "../src/blockString.ts";
import { hasDrawingProps, mergeDrawingProps, readDrawing } from "../src/schema.ts";
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

test("captionOf keeps only what the user typed next to the component", () => {
  assert.equal(captionOf("{{better-excalidraw: height=200}} {{-: Text elements in drawing: a ; b }} deploy  #diagram"), "deploy #diagram");
  assert.equal(captionOf("before {{better-excalidraw}} after"), "before after");
  assert.equal(captionOf("{{better-excalidraw}}"), "");
});

test("drawingIndexEntries drops look-alikes and sorts newest first", () => {
  const row = (uid, text, editTime) => ({ uid, text, pageTitle: "P", pageUid: "p", editTime });
  const entries = drawingIndexEntries([
    row("old", "{{better-excalidraw}}", 1),
    row("fake", "{{better-excalidraw-x}}", 9),
    row("new", "{{better-excalidraw: width=300}} caption", 5),
    row("tie", "{{better-excalidraw}}", 1),
  ]);
  assert.deepEqual(entries.map((e) => e.uid), ["new", "old", "tie"]);
});

test("matchesIndexFilter needs every word in the page title or block text", () => {
  const entry = { uid: "u", text: "{{better-excalidraw}} {{-: Text elements in drawing: Gitlab ; Push tag }}", pageTitle: "Deploy flow", pageUid: "p", editTime: 0 };
  assert.equal(matchesIndexFilter(entry, ""), true);
  assert.equal(matchesIndexFilter(entry, "  "), true);
  assert.equal(matchesIndexFilter(entry, "gitlab deploy"), true);
  assert.equal(matchesIndexFilter(entry, "gitlab jenkins"), false);
});
