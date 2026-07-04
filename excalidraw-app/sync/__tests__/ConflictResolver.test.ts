import { describe, it, expect } from "vitest";

import { ConflictResolver } from "../ConflictResolver";

import type { DocumentMeta } from "../../document/types";

const makeMeta = (overrides?: Partial<DocumentMeta>): DocumentMeta => ({
  id: "doc-1",
  name: "Test Doc",
  folderId: "root",
  createdAt: 1000,
  updatedAt: 2000,
  version: 3,
  remoteVersion: '"etag-abc"',
  dirty: true,
  ...overrides,
});

describe("ConflictResolver", () => {
  describe("hasConflict", () => {
    it("should detect conflict when remote version differs and local is dirty", () => {
      const meta = makeMeta({ remoteVersion: '"etag-old"' });
      expect(ConflictResolver.hasConflict(meta, '"etag-new"')).toBe(true);
    });

    it("should not detect conflict when remote version matches", () => {
      const meta = makeMeta({ remoteVersion: '"same"' });
      expect(ConflictResolver.hasConflict(meta, '"same"')).toBe(false);
    });

    it("should not detect conflict when local is not dirty", () => {
      const meta = makeMeta({ dirty: false });
      expect(ConflictResolver.hasConflict(meta, '"etag-new"')).toBe(false);
    });

    it("should not detect conflict when remote version is null (new doc)", () => {
      const meta = makeMeta({ remoteVersion: null });
      expect(ConflictResolver.hasConflict(meta, null)).toBe(false);
    });
  });

  describe("buildConflictInfo", () => {
    it("should build conflict info object", () => {
      const meta = makeMeta();
      const info = ConflictResolver.buildConflictInfo(meta, '"etag-new"', 3000);
      expect(info.documentId).toBe("doc-1");
      expect(info.documentName).toBe("Test Doc");
      expect(info.localVersion).toBe(3);
      expect(info.remoteVersion).toBe('"etag-new"');
      expect(info.localUpdatedAt).toBe(2000);
      expect(info.remoteUpdatedAt).toBe(3000);
    });
  });

  describe("resolveKeepBoth", () => {
    it("should generate a copy name with date suffix", () => {
      const meta = makeMeta({ name: "My Drawing" });
      const copyName = ConflictResolver.resolveKeepBoth(meta);
      expect(copyName).toMatch(/^My Drawing - Copy \d{4}-\d{2}-\d{2}$/);
    });
  });
});
