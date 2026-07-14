import { describe, it, expect, vi } from "vitest";
import {
  listAllObjectKeys,
  deleteAllObjectKeys,
} from "../../lib/s3-pagination.js";

/** Minimal stand-in for AWS command classes (only capture input). */
class FakeListCmd {
  constructor(input) {
    this.input = input;
  }
}
class FakeDeleteCmd {
  constructor(input) {
    this.input = input;
  }
}

describe("s3-pagination", () => {
  describe("listAllObjectKeys", () => {
    it("pages while IsTruncated and returns all keys", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          Contents: [{ Key: "proj/a" }, { Key: "proj/b" }],
          IsTruncated: true,
          NextContinuationToken: "tok-2",
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: "proj/c" }],
          IsTruncated: false,
        });

      const keys = await listAllObjectKeys(
        { send },
        FakeListCmd,
        "bucket",
        "proj/"
      );

      expect(keys).toEqual(["proj/a", "proj/b", "proj/c"]);
      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[0][0].input.ContinuationToken).toBeUndefined();
      expect(send.mock.calls[1][0].input.ContinuationToken).toBe("tok-2");
      expect(send.mock.calls[0][0].input.Prefix).toBe("proj/");
    });

    it("handles empty Contents", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        Contents: undefined,
        IsTruncated: false,
      });
      const keys = await listAllObjectKeys(
        { send },
        FakeListCmd,
        "bucket",
        "proj/"
      );
      expect(keys).toEqual([]);
    });
  });

  describe("deleteAllObjectKeys", () => {
    it("chunks deletes into batches of 1000", async () => {
      const send = vi.fn().mockResolvedValue({});
      const keys = Array.from({ length: 1005 }, (_, i) => `k${i}`);

      await deleteAllObjectKeys({ send }, FakeDeleteCmd, "bucket", keys);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[0][0].input.Delete.Objects).toHaveLength(1000);
      expect(send.mock.calls[1][0].input.Delete.Objects).toHaveLength(5);
    });

    it("no-ops on empty key list", async () => {
      const send = vi.fn();
      await deleteAllObjectKeys({ send }, FakeDeleteCmd, "bucket", []);
      expect(send).not.toHaveBeenCalled();
    });
  });
});
