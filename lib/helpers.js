/**
 * Pure helpers shared by the dorky CLI.
 * Kept out of bin/index.js so unit tests do not boot the full CLI.
 */
'use strict';

const { existsSync, readFileSync, writeFileSync } = require('fs');

const toPosix = (p) => (p ? String(p).replace(/\\/g, '/') : p);

const normalizeKeys = (obj) => {
  if (!obj) return {};
  const out = {};
  for (const k of Object.keys(obj)) out[toPosix(k)] = obj[k];
  return out;
};

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {});

const writeJson = (p, d) => writeFileSync(p, JSON.stringify(d, null, 2));

/** Parse .dorkyignore contents — same result for LF and CRLF. */
const parseIgnoreList = (text) => String(text || '').split(/\r?\n/).filter(Boolean);

/**
 * Match history commits by exact id or unique prefix.
 * Returns all matches (caller treats 0 / 1 / many).
 */
const matchHistoryCommits = (history, commitId) => {
  if (!commitId) return [];
  const id = String(commitId);
  return (Array.isArray(history) ? history : []).filter(
    (e) => e && (e.id === id || String(e.id).startsWith(id))
  );
};

const loadMetadata = (metadataPath) => {
  const meta = readJson(metadataPath);
  meta['stage-1-files'] = normalizeKeys(meta['stage-1-files']);
  meta['uploaded-files'] = normalizeKeys(meta['uploaded-files']);
  return meta;
};

const loadHistory = (historyPath) => {
  const history = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, 'utf8')) : [];
  if (!Array.isArray(history)) return [];
  return history.map((e) => ({ ...e, files: normalizeKeys(e.files) }));
};

module.exports = {
  toPosix,
  normalizeKeys,
  readJson,
  writeJson,
  parseIgnoreList,
  matchHistoryCommits,
  loadMetadata,
  loadHistory,
};
