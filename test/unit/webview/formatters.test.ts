// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  CELL_TRUNCATE_AT,
  NEWLINE_GLYPH,
  detectContent,
  displayValue,
  isNumericKind,
  prettifyJSON,
  prettifyXML,
} from "../../../client/src/webview/formatters";

describe("formatters.displayValue", () => {
  it("returns NULL for null", () => {
    expect(displayValue(null)).toEqual({
      text: "NULL", isNull: true, truncated: false,
    });
  });
  it("returns NULL for undefined", () => {
    expect(displayValue(undefined)).toEqual({
      text: "NULL", isNull: true, truncated: false,
    });
  });
  it("passes short strings through unchanged", () => {
    expect(displayValue("hello")).toEqual({
      text: "hello", isNull: false, truncated: false,
    });
  });
  it("collapses embedded newlines to the glyph", () => {
    const out = displayValue("a\nb\r\nc");
    expect(out.text).toBe(`a${NEWLINE_GLYPH}b${NEWLINE_GLYPH}c`);
    expect(out.isNull).toBe(false);
    expect(out.truncated).toBe(false);
  });
  it("truncates strings longer than the cap and adds ellipsis", () => {
    const long = "x".repeat(CELL_TRUNCATE_AT + 50);
    const out = displayValue(long);
    expect(out.text.endsWith("…")).toBe(true);
    expect(out.text.length).toBe(CELL_TRUNCATE_AT + 1);
    expect(out.truncated).toBe(true);
  });
  it("returns truncated=false at exactly the cap length", () => {
    const exact = "y".repeat(CELL_TRUNCATE_AT);
    expect(displayValue(exact).truncated).toBe(false);
  });
});

describe("formatters.isNumericKind", () => {
  it.each(["num", "currency", "date", "time", "datetime"] as const)(
    "treats %s as numeric",
    (kind) => {
      expect(isNumericKind(kind)).toBe(true);
    },
  );
  it.each(["char", "unknown"] as const)(
    "treats %s as non-numeric",
    (kind) => {
      expect(isNumericKind(kind)).toBe(false);
    },
  );
});

describe("formatters.detectContent", () => {
  it("recognises a JSON object", () => {
    expect(detectContent('{"a":1,"b":[1,2,3]}')).toBe("json");
  });
  it("recognises a JSON array", () => {
    expect(detectContent("[1,2,3]")).toBe("json");
  });
  it("falls back to text on JSON-shaped but invalid input", () => {
    expect(detectContent("{not json}")).toBe("text");
  });
  it("recognises XML", () => {
    expect(detectContent("<root><a/></root>")).toBe("xml");
  });
  it("returns text for plain prose", () => {
    expect(detectContent("hello world")).toBe("text");
  });
});

describe("formatters.prettifyJSON", () => {
  it("pretty-prints valid JSON", () => {
    expect(prettifyJSON('{"a":1}')).toBe('{\n  "a": 1\n}');
  });
  it("returns the original string when invalid", () => {
    expect(prettifyJSON("{invalid}")).toBe("{invalid}");
  });
});

describe("formatters.prettifyXML", () => {
  it("pretty-prints nested elements with indent", () => {
    const out = prettifyXML("<a><b/></a>");
    expect(out).toBe("<a>\n  <b/>\n</a>");
  });
  it("does not crash on malformed input — the regex is best-effort", () => {
    expect(typeof prettifyXML("<x>")).toBe("string");
  });
});
