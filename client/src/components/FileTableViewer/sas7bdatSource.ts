// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Open a local sas7bdat file by routing it through the active SAS
// session: assign a libname pointing at the file's directory, then drive
// the existing LibraryAdapter exactly as if the user had clicked on the
// dataset from the Libraries tree.
//
// The user's chosen connection (Viya / IOM / COM / SSH) decides which
// adapter we use; if no profile is active we surface a clear message
// rather than silently doing nothing.

import { l10n, window } from "vscode";

import * as path from "path";

import { profileConfig } from "../../commands/profile";
import { getSession } from "../../connection";
import LibraryAdapterFactory from "../LibraryNavigator/LibraryAdapterFactory";
import LibraryModel from "../LibraryNavigator/LibraryModel";
import PaginatedResultSet from "../LibraryNavigator/PaginatedResultSet";
import {
  LibraryItem,
  TableData,
  TableType,
} from "../LibraryNavigator/types";

export interface Sas7bdatTableHandle {
  /** Stable id for the panel. */
  uid: string;
  title: string;
  paginator: PaginatedResultSet<{ data: TableData; error?: Error }>;
  fetchColumns: () => ReturnType<LibraryModel["fetchColumns"]>;
  /** The synthetic library item — the dispatcher passes it back into
   *  `TablePropertiesViewer` if the user opens column properties. */
  item: LibraryItem;
}

/** Counter used to mint unique libnames per session. SAS librefs are
 *  capped at 8 chars; `_SBT0..9` gives us 10 concurrent files which is
 *  far more than we expect in a typical session. */
let librefCounter = 0;
/** Map directory → libref so reopening the same file (or another file
 *  in the same directory) reuses the existing libname. */
const dirToLibref = new Map<string, string>();

export async function sas7bdatSource(
  fsPath: string,
): Promise<Sas7bdatTableHandle | undefined> {
  const activeProfile = profileConfig.getProfileByName(
    profileConfig.getActiveProfile(),
  );
  if (!activeProfile) {
    void window.showInformationMessage(
      l10n.t(
        "Opening a sas7bdat file goes through the connected SAS session. " +
          "Add or pick a SAS connection profile first.",
      ),
    );
    return undefined;
  }

  const adapter = new LibraryAdapterFactory().create(
    activeProfile.connectionType,
  );

  const dir = path.dirname(fsPath);
  const datasetName = sasNameFromBasename(path.basename(fsPath));
  const libref = await ensureLibref(dir);

  const item: LibraryItem = {
    uid: `sas7bdat:${libref}.${datasetName}`,
    id: datasetName,
    name: datasetName,
    library: libref,
    type: TableType,
    readOnly: true,
  };

  const model = new LibraryModel(adapter);
  const paginator = model.getTableResultSet(item);

  return {
    uid: item.uid,
    title: path.basename(fsPath),
    paginator,
    fetchColumns: () => model.fetchColumns(item),
    item,
  };
}

/** Make sure the active session has a libname pointing at `dir`. We
 *  cache one libref per directory so reopening files from the same
 *  folder doesn't re-issue the libname. */
async function ensureLibref(dir: string): Promise<string> {
  const cached = dirToLibref.get(dir);
  if (cached) {return cached;}

  const libref = `_SBT${librefCounter++ % 10}`;
  // Path is wrapped in single quotes so embedded backslashes (Windows
  // paths) and spaces survive the journey to SAS unchanged. Internal
  // single quotes are escaped by doubling, matching SAS literal syntax.
  const safe = dir.replace(/'/g, "''");
  const session = getSession();
  await session.setup(true);
  await session.run(`libname ${libref} '${safe}';`);
  dirToLibref.set(dir, libref);
  return libref;
}

/** SAS dataset names are case-insensitive, max 32 chars, alphanumeric
 *  plus underscore, and must start with a letter or underscore. We map
 *  the file's basename onto that namespace conservatively. */
function sasNameFromBasename(basename: string): string {
  const stem = basename.replace(/\.sas7bdat$/i, "");
  let s = stem.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 32);
  if (!/^[A-Za-z_]/.test(s)) {s = "_" + s.slice(1);}
  return s.toUpperCase() || "DATA";
}

