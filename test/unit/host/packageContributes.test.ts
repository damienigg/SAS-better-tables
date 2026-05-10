// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Keeps `package.json`'s `contributes.*` block in lockstep with what
// the FileTableViewer dispatcher actually exposes. Catches drift where
// e.g. someone removes a command from package.json but leaves the
// handler in place (or vice versa), or shrinks the explorer-context
// menu glob without updating the dispatcher's SUPPORTED set.
//
// Without this test the symptom would be a feature that "works in
// dev" but is unreachable through any user-visible surface — exactly
// the kind of drift unit tests on individual modules can't catch.

import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  REGISTERED_COMMANDS,
  SUPPORTED,
} from "../../../client/src/components/FileTableViewer";

interface PackageJson {
  contributes?: {
    commands?: Array<{ command: string }>;
    menus?: Record<string, Array<{ command: string; when?: string }>>;
    customEditors?: Array<{
      viewType: string;
      selector: Array<{ filenamePattern: string }>;
    }>;
  };
}

const root = path.resolve(__dirname, "../../..");
const pkg: PackageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);

describe("package.json — commands", () => {
  it("every contributes.commands entry starting with SBT. is registered by FileTableViewer", () => {
    const declared = (pkg.contributes?.commands ?? [])
      .map((c) => c.command)
      .filter((c) => c.startsWith("SBT."));
    expect(declared.length).toBeGreaterThan(0);
    for (const cmd of declared) {
      expect(REGISTERED_COMMANDS).toContain(cmd);
    }
  });

  it("every command FileTableViewer registers is declared in contributes.commands", () => {
    const declared = new Set(
      (pkg.contributes?.commands ?? []).map((c) => c.command),
    );
    for (const cmd of REGISTERED_COMMANDS) {
      expect(declared.has(cmd)).toBe(true);
    }
  });
});

describe("package.json — explorer/context menu", () => {
  const entry = pkg.contributes?.menus?.["explorer/context"]?.find(
    (e) => e.command === "SBT.openTableFile",
  );

  it("declares an explorer/context entry for SBT.openTableFile", () => {
    expect(entry).toBeDefined();
  });

  it("the resourceExtname clause matches the dispatcher's SUPPORTED set exactly", () => {
    expect(entry).toBeDefined();
    const when = entry!.when ?? "";
    // Pull the alternation list out of the regex literal in the
    // when-clause: `resourceExtname =~ /\.(csv|tsv|xlsx|sas7bdat)$/`
    const match = when.match(/\\\.\(([^)]*)\)/);
    expect(match, `when-clause has no extension regex: ${when}`).toBeTruthy();
    const declared = match![1].split("|").map((e) => "." + e);
    expect(new Set(declared)).toEqual(SUPPORTED);
  });
});

describe("package.json — customEditors", () => {
  const editor = pkg.contributes?.customEditors?.find(
    (e) => e.viewType === "sbt.tableViewer",
  );

  it("declares the sbt.tableViewer custom editor", () => {
    expect(editor).toBeDefined();
  });

  it("the filenamePattern selectors cover every extension in the dispatcher's SUPPORTED set", () => {
    expect(editor).toBeDefined();
    const patterns = editor!.selector.map((s) => s.filenamePattern);
    // Patterns are "*.csv" / "*.xlsx" / etc.
    const declared = patterns.map((p) => p.replace(/^\*/, ""));
    expect(new Set(declared)).toEqual(SUPPORTED);
  });
});
