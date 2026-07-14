import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  toPosix,
  normalizeKeys,
  readJson,
  writeJson,
  parseIgnoreList,
  matchHistoryCommits,
  loadMetadata,
  loadHistory,
} from "../../lib/helpers.js";

describe("helpers (unit)", () => {
  describe("toPosix", () => {
    it("converts backslashes to forward slashes", () => {
      expect(toPosix("a\\b\\c")).toBe("a/b/c");
    });
    it("leaves posix paths alone", () => {
      expect(toPosix("a/b/c")).toBe("a/b/c");
    });
    it("is null/empty-safe", () => {
      expect(toPosix(null)).toBe(null);
      expect(toPosix(undefined)).toBe(undefined);
      expect(toPosix("")).toBe("");
    });
  });

  describe("normalizeKeys", () => {
    it("normalizes Windows-style keys and preserves values", () => {
      expect(normalizeKeys({ "src\\a.env": "h1", "src/b.env": "h2" })).toEqual({
        "src/a.env": "h1",
        "src/b.env": "h2",
      });
    });
    it("returns {} for null/undefined", () => {
      expect(normalizeKeys(null)).toEqual({});
      expect(normalizeKeys(undefined)).toEqual({});
    });
  });

  describe("parseIgnoreList", () => {
    it("parses LF and CRLF the same", () => {
      const lf = parseIgnoreList(".env\nnode_modules\n");
      const crlf = parseIgnoreList(".env\r\nnode_modules\r\n");
      expect(lf).toEqual([".env", "node_modules"]);
      expect(crlf).toEqual(lf);
    });
    it("drops empty lines", () => {
      expect(parseIgnoreList("a\n\n\nb\n")).toEqual(["a", "b"]);
    });
  });

  describe("matchHistoryCommits", () => {
    const history = [
      { id: "abc123def", files: {} },
      { id: "abc999xyz", files: {} },
      { id: "fff000aaa", files: {} },
    ];
    it("exact match", () => {
      expect(matchHistoryCommits(history, "fff000aaa")).toHaveLength(1);
      expect(matchHistoryCommits(history, "fff000aaa")[0].id).toBe("fff000aaa");
    });
    it("unique prefix match", () => {
      expect(matchHistoryCommits(history, "fff")).toHaveLength(1);
    });
    it("ambiguous prefix", () => {
      expect(matchHistoryCommits(history, "abc")).toHaveLength(2);
    });
    it("no match", () => {
      expect(matchHistoryCommits(history, "zzz")).toHaveLength(0);
    });
  });

  describe("readJson / loadMetadata / loadHistory", () => {
    let dir;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "dorky-unit-"));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it("readJson missing file → {}", () => {
      expect(readJson(path.join(dir, "nope.json"))).toEqual({});
    });

    it("loadMetadata normalizes file map keys", () => {
      const metaPath = path.join(dir, "metadata.json");
      writeJson(metaPath, {
        "stage-1-files": { "a\\b.env": "x" },
        "uploaded-files": { "c\\d.env": "y" },
      });
      const meta = loadMetadata(metaPath);
      expect(meta["stage-1-files"]).toEqual({ "a/b.env": "x" });
      expect(meta["uploaded-files"]).toEqual({ "c/d.env": "y" });
    });

    it("loadHistory missing → [] and normalizes entry files", () => {
      expect(loadHistory(path.join(dir, "history.json"))).toEqual([]);
      const histPath = path.join(dir, "history.json");
      writeJson(histPath, [{ id: "1", files: { "x\\y": "h" } }]);
      const h = loadHistory(histPath);
      expect(h[0].files).toEqual({ "x/y": "h" });
    });
  });
});
