// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  delimiterForExt,
  parseCsv,
} from "../../../client/src/components/FileTableViewer/csvParser";

const FIXTURES = path.resolve(__dirname, "../../fixtures");

function fromString(s: string): Readable {
  return Readable.from([s]);
}

describe("csvParser.delimiterForExt", () => {
  it.each([
    [".csv", ","],
    [".tsv", "\t"],
    [".CSV", ","],
    [".TSV", "\t"],
    [".txt", ","], // unknown extensions default to CSV
  ])("maps %s → %s", (ext, expected) => {
    expect(delimiterForExt(ext)).toBe(expected);
  });
});

describe("csvParser.parseCsv — basics", () => {
  it("parses a simple two-row CSV", async () => {
    const rows = await parseCsv(fromString("a,b,c\n1,2,3\n"));
    expect(rows).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });
  it("parses without a trailing newline", async () => {
    const rows = await parseCsv(fromString("a,b\n1,2"));
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("parses TSV via the delimiter option", async () => {
    const rows = await parseCsv(fromString("a\tb\n1\t2\n"), { delimiter: "\t" });
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("returns an empty array for an empty stream", async () => {
    expect(await parseCsv(fromString(""))).toEqual([]);
  });
});

describe("csvParser.parseCsv — quoting", () => {
  it("handles quoted cells with embedded commas", async () => {
    const rows = await parseCsv(fromString('"a,b",c\n1,2\n'));
    expect(rows).toEqual([["a,b", "c"], ["1", "2"]]);
  });
  it('handles "" → " escape inside quoted cells', async () => {
    const rows = await parseCsv(fromString('"a""b",c\n'));
    expect(rows).toEqual([["a\"b", "c"]]);
  });
  it("handles quoted cells with embedded newlines", async () => {
    const rows = await parseCsv(fromString('"line1\nline2",x\nplain,y\n'));
    expect(rows).toEqual([["line1\nline2", "x"], ["plain", "y"]]);
  });
});

describe("csvParser.parseCsv — line endings", () => {
  it("treats CRLF as a record terminator", async () => {
    const rows = await parseCsv(fromString("a,b\r\n1,2\r\n"));
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("treats lone CR as nothing (only LF closes records)", async () => {
    // mssql-style: CR alone should not split a row. Our reader matches.
    const rows = await parseCsv(fromString("a,b\r1,2\n"));
    expect(rows).toEqual([["a", "b1", "2"]]);
  });
});

describe("csvParser.parseCsv — BOM", () => {
  it("strips a leading UTF-8 BOM from the first cell", async () => {
    const rows = await parseCsv(fromString("﻿a,b\n1,2\n"));
    expect(rows[0]).toEqual(["a", "b"]);
  });
  it("does not strip BOM-like sequences inside the data", async () => {
    const rows = await parseCsv(fromString("a,b\n﻿x,y\n"));
    expect(rows[1][0]).toBe("﻿x");
  });
});

describe("csvParser.parseCsv — fixture files", () => {
  it("reads the cars.csv fixture as 6 rows × 5 cols", async () => {
    const rows = await parseCsv(
      createReadStream(path.join(FIXTURES, "cars.csv"), { encoding: "utf8" }),
    );
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual(["make", "model", "year", "price", "electric"]);
    expect(rows[3]).toEqual(["Tesla", "Model 3", "2023", "45000", "yes"]);
  });

  it("reads quoted.csv exactly", async () => {
    const rows = await parseCsv(
      createReadStream(path.join(FIXTURES, "quoted.csv"), { encoding: "utf8" }),
    );
    expect(rows).toEqual([
      ["name", "note"],
      ["Smith, Jane", 'She said "hi"'],
      ["O'Connor", "line one\nline two"],
      ["plain", "nothing"],
    ]);
  });

  it("reads bom.csv with the BOM stripped", async () => {
    const rows = await parseCsv(
      createReadStream(path.join(FIXTURES, "bom.csv"), { encoding: "utf8" }),
    );
    expect(rows[0]).toEqual(["a", "b", "c"]);
    expect(rows[1]).toEqual(["1", "2", "3"]);
  });
});

describe("csvParser.parseCsv — Buffer streams", () => {
  it("decodes utf-8 buffers", async () => {
    const stream = Readable.from([Buffer.from("a,b\n1,2\n", "utf8")]);
    expect(await parseCsv(stream)).toEqual([
      ["a", "b"], ["1", "2"],
    ]);
  });
});
