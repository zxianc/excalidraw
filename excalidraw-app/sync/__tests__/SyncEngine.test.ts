import { describe, it, expect, vi, beforeEach } from "vitest";

import { SyncEngine } from "../SyncEngine";

import type { StorageAdapter } from "../../storage/StorageAdapter";
import type {
  DocumentMeta,
  DocumentData,
  Manifest,
} from "../../document/types";

function createMockAdapter(): StorageAdapter & {
  _docs: Map<string, DocumentData>;
  _metas: Map<string, DocumentMeta>;
  _manifest: Manifest | null;
} {
  const docs = new Map<string, DocumentData>();
  const metas = new Map<string, DocumentMeta>();
  let manifest: Manifest | null = null;
  return {
    _docs: docs,
    _metas: metas,
    _manifest: manifest,
    listDocuments: vi.fn(async () => Array.from(metas.values())),
    loadDocument: vi.fn(async (id: string) => docs.get(id) ?? null),
    saveDocument: vi.fn(
      async (id: string, data: DocumentData, meta: DocumentMeta) => {
        docs.set(id, data);
        metas.set(id, meta);
      },
    ),
    deleteDocument: vi.fn(async (id: string) => {
      docs.delete(id);
      metas.delete(id);
    }),
    getManifest: vi.fn(async () => manifest),
    saveManifest: vi.fn(async (m: Manifest) => {
      manifest = m;
    }),
    getRemoteVersion: vi.fn(async () => null),
    testConnection: vi.fn(async () => {}),
  };
}

const makeMeta = (overrides?: Partial<DocumentMeta>): DocumentMeta => ({
  id: "doc-1",
  name: "Test",
  folderId: "root",
  createdAt: 1000,
  updatedAt: 2000,
  version: 1,
  remoteVersion: null,
  dirty: false,
  ...overrides,
});
const makeData = (): DocumentData => ({
  elements: [],
  appState: {},
  files: {},
});

describe("SyncEngine", () => {
  let local: ReturnType<typeof createMockAdapter>;
  let remote: ReturnType<typeof createMockAdapter>;
  let engine: SyncEngine;

  beforeEach(() => {
    local = createMockAdapter();
    remote = createMockAdapter();
    engine = new SyncEngine(local, remote);
  });

  it("should sync a new document to remote (no conflict)", async () => {
    const meta = makeMeta({ dirty: true });
    await local.saveDocument("doc-1", makeData(), meta);
    const manifest: Manifest = {
      version: 1,
      folders: {
        root: {
          id: "root",
          name: "Root",
          parentId: null,
          children: [],
          documents: ["doc-1"],
        },
      },
      documents: { "doc-1": meta },
    };
    await local.saveManifest(manifest);
    (remote.getRemoteVersion as any).mockResolvedValue(null);
    const result = await engine.syncDocument("doc-1");
    expect(result).toBe("synced");
    expect(remote.saveDocument).toHaveBeenCalled();
  });

  it("should detect conflict when remote version changed", async () => {
    const meta = makeMeta({ dirty: true, remoteVersion: '"old-etag"' });
    await local.saveDocument("doc-1", makeData(), meta);
    (remote.getRemoteVersion as any).mockResolvedValue('"new-etag"');
    const result = await engine.syncDocument("doc-1");
    expect(result).toBe("conflict");
  });

  it("should skip sync when document is not dirty", async () => {
    await local.saveDocument("doc-1", makeData(), makeMeta({ dirty: false }));
    const result = await engine.syncDocument("doc-1");
    expect(result).toBe("skipped");
    expect(remote.saveDocument).not.toHaveBeenCalled();
  });

  it("should resolve conflict with keep-local choice", async () => {
    const meta = makeMeta({ dirty: true, remoteVersion: '"old"' });
    await local.saveDocument("doc-1", makeData(), meta);
    (remote.getRemoteVersion as any).mockResolvedValue('"new"');
    await engine.syncDocument("doc-1");
    await engine.resolveConflict("doc-1", "keep-local");
    expect(remote.saveDocument).toHaveBeenCalled();
  });
});
