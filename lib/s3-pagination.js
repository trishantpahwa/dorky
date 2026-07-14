"use strict";

/**
 * List all object keys under a prefix (paginates past the 1000-key ListObjectsV2 cap).
 * @param {{ send: Function }} s3
 * @param {new (...args: any[]) => any} ListObjectsV2Command
 * @param {string} bucket
 * @param {string} prefix
 * @returns {Promise<string[]>}
 */
async function listAllObjectKeys(s3, ListObjectsV2Command, bucket, prefix) {
  const keys = [];
  let ContinuationToken;
  do {
    const data = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken,
      })
    );
    for (const o of data.Contents || []) {
      if (o.Key) keys.push(o.Key);
    }
    ContinuationToken = data.IsTruncated ? data.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}

/**
 * Delete all keys, chunking DeleteObjectsCommand to ≤1000 keys per request.
 * @param {{ send: Function }} s3
 * @param {new (...args: any[]) => any} DeleteObjectsCommand
 * @param {string} bucket
 * @param {string[]} keys
 */
async function deleteAllObjectKeys(s3, DeleteObjectsCommand, bucket, keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    if (!chunk.length) continue;
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })) },
      })
    );
  }
}

module.exports = {
  listAllObjectKeys,
  deleteAllObjectKeys,
};
