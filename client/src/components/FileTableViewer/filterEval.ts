// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0
//
// Predicate evaluator for in-memory file sources. Supports two modes per
// column, picked by which field of `ColumnFilter` is set:
//
//   - `values`: exact-match checklist (fast — Set inclusion)
//   - `expr`:   one of `=, !=, <>, <, <=, >, >=, contains, like, in (...)`
//                with an optional leading column name. Numeric comparisons
//                kick in when the literal parses as a number; otherwise
//                lexicographic.
//
// This is deliberately thinner than SAS WHERE — it covers the cases the
// header filter popup can actually drive a user into.

import type { ColumnFilter } from "../../webview/protocol";

export type RowPredicate = (row: (string | null)[]) => boolean;

export function buildRowPredicate(
  filters: ColumnFilter[],
  colIndex: (id: string) => number,
): RowPredicate {
  if (filters.length === 0) {return () => true;}
  const compiled: RowPredicate[] = [];
  for (const f of filters) {
    const idx = colIndex(f.colId);
    if (idx < 0) {continue;}
    compiled.push(compile(f, idx));
  }
  if (compiled.length === 0) {return () => true;}
  return (row) => {
    for (const p of compiled) {
      if (!p(row)) {return false;}
    }
    return true;
  };
}

function compile(f: ColumnFilter, idx: number): RowPredicate {
  if (f.expr && f.expr.trim()) {return compileExpr(f.expr.trim(), idx);}
  if (f.values) {
    const set = new Set(f.values);
    return (row) => {
      const v = row[idx];
      return v !== null && set.has(v);
    };
  }
  return () => true;
}

// Optional leading column-name token, then the operator, then the
// rest of the expression. The operator group is in a non-capturing
// alternation; the engine backtracks past the optional prefix when a
// would-be column name is itself the operator (e.g. `contains "foo"`).
// Word-op alternatives carry their own \b so they cannot be a prefix
// of a longer identifier; symbolic ops do not — \b would not match
// at the transition between two non-word characters.
const OP_RE =
  /^(?:[A-Za-z_][A-Za-z0-9_]*\s+)?(>=|<=|!=|<>|=|<|>|contains\b|like\b|in\b)\s*([\s\S]*)$/i;

function compileExpr(expr: string, idx: number): RowPredicate {
  const m = expr.match(OP_RE);
  if (!m) {return () => true;}
  const op = m[1].toLowerCase();
  let raw = m[2].trim();

  if (op === "in") {
    raw = raw.replace(/^\(/, "").replace(/\)$/, "").trim();
    const set = new Set(parseList(raw));
    return (row) => {
      const v = row[idx];
      return v !== null && set.has(v);
    };
  }

  const value = unquote(raw);
  const numLit = parseFloat(value);
  const isNumLit = !Number.isNaN(numLit) && /^-?\d/.test(value);

  switch (op) {
    case "=":
      return (row) => row[idx] !== null && row[idx] === value;
    case "!=":
    case "<>":
      return (row) => row[idx] !== null && row[idx] !== value;
    case "contains":
      return (row) => {
        const v = row[idx];
        return v !== null && v.includes(value);
      };
    case "like": {
      const re = new RegExp(
        "^" +
          value
            .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
            .replace(/%/g, ".*")
            .replace(/_/g, ".") +
          "$",
      );
      return (row) => {
        const v = row[idx];
        return v !== null && re.test(v);
      };
    }
    case "<":
    case "<=":
    case ">":
    case ">=":
      return (row) => {
        const v = row[idx];
        if (v === null || v === "") {return false;}
        if (isNumLit) {
          const n = parseFloat(v);
          if (Number.isNaN(n)) {return false;}
          if (op === "<") {return n < numLit;}
          if (op === "<=") {return n <= numLit;}
          if (op === ">") {return n > numLit;}
          return n >= numLit;
        }
        if (op === "<") {return v < value;}
        if (op === "<=") {return v <= value;}
        if (op === ">") {return v > value;}
        return v >= value;
      };
    default:
      return () => true;
  }
}

function unquote(raw: string): string {
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

function parseList(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  let q = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === q) {inQuote = false;}
      else {cur += c;}
    } else if (c === '"' || c === "'") {
      inQuote = true;
      q = c;
    } else if (c === ",") {
      const v = cur.trim();
      if (v.length > 0) {out.push(unquote(v));}
      cur = "";
    } else {
      cur += c;
    }
  }
  const tail = cur.trim();
  if (tail.length > 0) {out.push(unquote(tail));}
  return out;
}
