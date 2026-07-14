"use strict";

const { existsSync, readFileSync, writeFileSync } = require("fs");
const path = require("path");

const DORKY_DIR = ".dorky";
const METADATA_PATH = path.join(DORKY_DIR, "metadata.json");
const HISTORY_PATH = path.join(DORKY_DIR, "history.json");

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {});
const writeJson = (p, d) => writeFileSync(p, JSON.stringify(d, null, 2));

const toPosix = (p) => (p ? p.replace(/\\/g, "/") : p);

const normalizeKeys = (obj) => {
  if (!obj) return {};
  const out = {};
  for (const k of Object.keys(obj)) out[toPosix(k)] = obj[k];
  return out;
};

const readMetadata = () => {
  const meta = readJson(METADATA_PATH);
  meta["stage-1-files"] = normalizeKeys(meta["stage-1-files"]);
  meta["uploaded-files"] = normalizeKeys(meta["uploaded-files"]);
  return meta;
};

const readHistory = () => {
  const history = existsSync(HISTORY_PATH)
    ? JSON.parse(readFileSync(HISTORY_PATH, "utf8"))
    : [];
  return history.map((e) => ({ ...e, files: normalizeKeys(e.files) }));
};

/** Parse .dorkyignore content — accepts \\n and \\r\\n. */
const parseDorkyIgnore = (content) =>
  String(content || "")
    .split(/\r?\n/)
    .filter(Boolean);

/**
 * Escape a name for Google Drive query single-quoted values.
 * Drive expects \ and ' to be backslash-escaped inside the quotes.
 */
const escapeDriveName = (name) =>
  String(name == null ? "" : name)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");

/**
 * Match history entries for checkout by exact id or unique prefix.
 * @returns {{ matches: object[], status: 'none'|'exact'|'ambiguous' }}
 */
const matchCheckoutEntries = (history, commitId) => {
  if (!commitId) return { matches: [], status: "none" };
  const matches = (history || []).filter(
    (e) => e.id === commitId || String(e.id).startsWith(commitId)
  );
  if (matches.length === 0) return { matches, status: "none" };
  if (matches.length > 1) return { matches, status: "ambiguous" };
  return { matches, status: "exact" };
};

module.exports = {
  DORKY_DIR,
  METADATA_PATH,
  HISTORY_PATH,
  readJson,
  writeJson,
  toPosix,
  normalizeKeys,
  readMetadata,
  readHistory,
  parseDorkyIgnore,
  matchCheckoutEntries,
  escapeDriveName,
};
