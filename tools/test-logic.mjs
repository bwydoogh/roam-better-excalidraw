import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMirror,
  isDrawingBlock,
  isNativeDrawingBlock,
  parseOptions,
  toBetterExcalidraw,
  toNativeExcalidraw,
  withMirror,
} from "../src/blockString.ts";
import { hasDrawingProps, mergeDrawingProps, readDrawing } from "../src/schema.ts";

const NATIVE = '{{[[excalidraw]]}} {{-: Text elements in drawing: Gitlab ; Push tag ; start "automated\ndeployment" }}';

test("detects drawing blocks", () => {
  assert.equal(isDrawingBlock("{{better-excalidraw}}"), true);
  assert.equal(isDrawingBlock("{{better-excalidraw: height=400}}"), true);
  assert.equal(isDrawingBlock(NATIVE), false);
  assert.equal(isNativeDrawingBlock(NATIVE), true);
  assert.equal(isNativeDrawingBlock("{{excalidraw}}"), true);
  assert.equal(isNativeDrawingBlock("[[excalidraw]]"), false);
});

test("parses height override", () => {
  assert.deepEqual(parseOptions("{{better-excalidraw}}"), {});
  assert.deepEqual(parseOptions("{{better-excalidraw: height=400}}"), { height: 400 });
  assert.deepEqual(parseOptions("{{better-excalidraw:height=abc}}"), {});
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
