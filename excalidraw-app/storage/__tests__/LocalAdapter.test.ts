import { describe, it, expect, beforeEach } from "vitest";
import { LocalAdapter } from "../LocalAdapter";
import type { DocumentData, DocumentMeta, Manifest } from "../../document/types";

import "fake-indexeddb/auto";

const makeDocMeta = (overrides?: Partial<DocumentMeta>): DocumentMeta => ({
  id: "doc-1",
  name: "Test Doc",
  folderId: "root",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  version: 1,
  remoteVersion: null,
  dirty: false,
  ...overrides,
});

const makeDocData = (): DocumentData => ({
  elements: [],
  appState: {},
  files: {},
});

const makeManifest = (): Manifest => ({
  version: 1,
  folders: {
    root: { id: "root", name: "Root", parentId: null, children: [], documents: ["doc-1"] },
  },
  documents: { "doc-1": makeDocMeta() },
});

// Helper to wipe databases — must be called with NO open connections
async function wipeDatabases() {
  const dbs = await indexedDB.databases();
  await Promise.all(
    dbs.map((db) => {
      if (db.name) {
        return new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase(db.name!);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
      return Promise.resolve();
    }),
  );
}

describe("LocalAdapter", () => {
  beforeEach(async () => {
    // Close any open connections first by ensuring no reference remains
    // Each test creates and uses its own adapter
    await wipeDatabases();
  });

  it("should save and load a document", async () => {
    const adapter = new LocalAdapter();
    const meta = makeDocMeta();
    const data = makeDocData();
    await adapter.saveDocument("doc-1", data, meta);
    const loaded = await adapter.loadDocument("doc-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.elements).toEqual([]);
    await adapter.close();
  });

  it("should return null for non-existent document", async () => {
    const adapter = new LocalAdapter();
    const loaded = await adapter.loadDocument("non-existent");
    expect(loaded).toBeNull();
    await adapter.close();
  });

  it("should list documents", async () => {
    const adapter = new LocalAdapter();
    const meta = makeDocMeta();
    const data = makeDocData();
    await adapter.saveDocument("doc-1", data, meta);
    const docs = await adapter.listDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe("doc-1");
    await adapter.close();
  });

  it("should delete a document", async () => {
    const adapter = new LocalAdapter();
    const meta = makeDocMeta();
    const data = makeDocData();
    await adapter.saveDocument("doc-1", data, meta);
    await adapter.deleteDocument("doc-1");
    const loaded = await adapter.loadDocument("doc-1");
    expect(loaded).toBeNull();
    await adapter.close();
  });

  it("should save and load manifest", async () => {
    const adapter = new LocalAdapter();
    const manifest = makeManifest();
    await adapter.saveManifest(manifest);
    const loaded = await adapter.getManifest();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.documents["doc-1"].name).toBe("Test Doc");
    await adapter.close();
  });

  it("should return null for manifest when none saved", async () => {
    const adapter = new LocalAdapter();
    const loaded = await adapter.getManifest();
    expect(loaded).toBeNull();
    await adapter.close();
  });
});
