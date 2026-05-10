// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __testHooks } from "../../mocks/vscode";

// We mock the connection module and profile module ahead of importing
// the system-under-test so the SUT picks up the doubles. Mock state is
// held in a hoisted record so test bodies can poke at it.
const mockState = vi.hoisted(() => ({
  session: {
    setupCalls: 0,
    ran: [] as string[],
  },
  profileActive: true,
}));

vi.mock("../../../client/src/connection", () => ({
  getSession: () => ({
    async setup() { mockState.session.setupCalls++; },
    async run(code: string) { mockState.session.ran.push(code); return {}; },
    sessionId() { return "test-session"; },
  }),
}));

vi.mock("../../../client/src/commands/profile", () => ({
  profileConfig: {
    getActiveProfile: () => "active",
    getProfileByName: (_name: string) =>
      mockState.profileActive ? { connectionType: "rest" } : undefined,
  },
}));

// Imported AFTER the mocks so the SUT picks them up.
const sourceMod = await import(
  "../../../client/src/components/FileTableViewer/sas7bdatSource"
);
const { __resetForTests, sas7bdatSource, sasNameFromBasename } = sourceMod;

beforeEach(() => {
  __resetForTests();
  mockState.session.ran.length = 0;
  mockState.session.setupCalls = 0;
  mockState.profileActive = true;
});
afterEach(() => {
  __resetForTests();
});

describe("sas7bdatSource — open flow", () => {
  it("warns and returns undefined when no SAS profile is active", async () => {
    mockState.profileActive = false;
    const handle = await sas7bdatSource("/data/cars.sas7bdat");
    expect(handle).toBeUndefined();
    expect(__testHooks.shownInfoMessages.length).toBeGreaterThan(0);
  });

  it("issues exactly one libname per directory and reuses it on the next call", async () => {
    const a = await sas7bdatSource("/data/dir1/A.sas7bdat");
    const b = await sas7bdatSource("/data/dir1/B.sas7bdat");
    const c = await sas7bdatSource("/data/dir2/C.sas7bdat");

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();

    const librefStmts = mockState.session.ran.filter((s) =>
      /^libname /.test(s),
    );
    expect(librefStmts).toHaveLength(2);
    expect(librefStmts[0]).toContain("'/data/dir1'");
    expect(librefStmts[1]).toContain("'/data/dir2'");

    expect(a!.item.library).toBe(b!.item.library);
    expect(a!.item.library).not.toBe(c!.item.library);
  });

  it("escapes single quotes in directory paths so the libname statement stays balanced", async () => {
    await sas7bdatSource("/data/it's/cars.sas7bdat");
    expect(mockState.session.ran[0]).toContain("'/data/it''s'");
  });

  it("derives a synthetic LibraryItem with the dataset name and a per-directory libref", async () => {
    const handle = await sas7bdatSource("/data/dir/cars.sas7bdat");
    expect(handle!.item.name).toBe("CARS");
    expect(handle!.item.type).toBe("table");
    expect(handle!.item.readOnly).toBe(true);
    expect(handle!.item.library).toMatch(/^_SBT\d$/);
  });
});

describe("sasNameFromBasename", () => {
  it.each([
    ["cars.sas7bdat", "CARS"],
    ["my-data_file.sas7bdat", "MY_DATA_FILE"],
    ["123start.sas7bdat", "_23START"],
    ["weird name.sas7bdat", "WEIRD_NAME"],
  ])("maps %s → %s", (input, expected) => {
    expect(sasNameFromBasename(input)).toBe(expected);
  });

  it("truncates names longer than 32 characters", () => {
    const long = "a".repeat(40) + ".sas7bdat";
    expect(sasNameFromBasename(long)).toHaveLength(32);
  });
});
