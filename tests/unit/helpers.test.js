import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  toPosix,
  normalizeKeys,
  readMetadata,
  readHistory,
  parseDorkyIgnore,
  matchCheckoutEntries,
  escapeDriveName,
  DORKY_DIR,
  METADATA_PATH,
  HISTORY_PATH,
} from "../../lib/helpers.js";

describe("helpers", () => {
  describe("toPosix", () => {
    it("turns backslashes into forward slashes", () => {
      expect(toPosix("foo\\bar\\baz")).toBe("foo/bar/baz");
    });
    it("is null/empty-safe", () => {
      expect(toPosix(null)).toBe(null);
      expect(toPosix(undefined)).toBe(undefined);
      expect(toPosix("")).toBe("");
    });
    it("leaves posix paths alone", () => {
      expect(toPosix("a/b/c")).toBe("a/b/c");
    });
  });

  describe("normalizeKeys", () => {
    it("normalizes windows-style keys and preserves values", () => {
      expect(normalizeKeys({ "src\\a.env": 1, "src/b.env": 2 })).toEqual({
        "src/a.env": 1,
        "src/b.env": 2,
      });
    });
    it("returns {} for nullish", () => {
      expect(normalizeKeys(null)).toEqual({});
      expect(normalizeKeys(undefined)).toEqual({});
    });
  });

  describe("parseDorkyIgnore", () => {
    it("parses \\n and \\r\\n the same", () => {
      const a = parseDorkyIgnore("secrets\n*.pem\n");
      const b = parseDorkyIgnore("secrets\r\n*.pem\r\n");
      expect(a).toEqual(["secrets", "*.pem"]);
      expect(b).toEqual(["secrets", "*.pem"]);
    });
    it("drops empty lines", () => {
      expect(parseDorkyIgnore("a\n\n\nb\n")).toEqual(["a", "b"]);
    });
  });

  describe("escapeDriveName", () => {
    it("escapes apostrophes and backslashes for Drive queries", () => {
      expect(escapeDriveName("bob's-app")).toBe("bob\\'s-app");
      expect(escapeDriveName("a\\b")).toBe("a\\\\b");
      expect(escapeDriveName("normal")).toBe("normal");
    });
  });

  describe("matchCheckoutEntries", () => {
    const history = [
      { id: "abcdef12", files: {} },
      { id: "abc99999", files: {} },
      { id: "deadbeef", files: {} },
    ];
    it("exact match", () => {
      const r = matchCheckoutEntries(history, "deadbeef");
      expect(r.status).toBe("exact");
      expect(r.matches).toHaveLength(1);
      expect(r.matches[0].id).toBe("deadbeef");
    });
    it("unique prefix", () => {
      const r = matchCheckoutEntries(history, "dead");
      expect(r.status).toBe("exact");
      expect(r.matches[0].id).toBe("deadbeef");
    });
    it("ambiguous prefix", () => {
      const r = matchCheckoutEntries(history, "abc");
      expect(r.status).toBe("ambiguous");
      expect(r.matches).toHaveLength(2);
    });
    it("none", () => {
      expect(matchCheckoutEntries(history, "ffff").status).toBe("none");
    });
  });

  describe("readMetadata / readHistory", () => {
    let tmp;
    let prev;
    beforeEach(() => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dorky-unit-"));
      prev = process.cwd();
      process.chdir(tmp);
    });
    afterEach(() => {
      process.chdir(prev);
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    it("readMetadata returns normalized defaults when missing", () => {
      const meta = readMetadata();
      expect(meta["stage-1-files"]).toEqual({});
      expect(meta["uploaded-files"]).toEqual({});
    });

    it("readHistory returns [] when missing", () => {
      expect(readHistory()).toEqual([]);
    });

    it("readMetadata normalizes windows keys from disk", () => {
      fs.mkdirSync(DORKY_DIR);
      fs.writeFileSync(
        METADATA_PATH,
        JSON.stringify({
          "stage-1-files": { "a\\b.env": { hash: "1" } },
          "uploaded-files": { "c\\d.env": { hash: "2" } },
        })
      );
      const meta = readMetadata();
      expect(meta["stage-1-files"]).toEqual({ "a/b.env": { hash: "1" } });
      expect(meta["uploaded-files"]).toEqual({ "c/d.env": { hash: "2" } });
    });

    it("readHistory normalizes file keys", () => {
      fs.mkdirSync(DORKY_DIR);
      fs.writeFileSync(
        HISTORY_PATH,
        JSON.stringify([{ id: "abc", files: { "x\\y": true } }])
      );
      const hist = readHistory();
      expect(hist[0].files).toEqual({ "x/y": true });
    });
  });
});
