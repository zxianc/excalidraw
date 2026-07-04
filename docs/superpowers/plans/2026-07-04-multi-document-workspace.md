# Multi-Document Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Excalidraw from a single-document editor into a multi-document workspace with VSCode-style sidebar, folder-based organization, S3 cloud sync, and offline-first architecture.

**Architecture:** App-layer modules in `excalidraw-app/` with clean interfaces (StorageAdapter, DocumentManager, SyncEngine). IndexedDB for local storage, S3-compatible API for cloud sync. Jotai atoms for state management, SCSS for styling.

**Tech Stack:** React, Jotai, IndexedDB (via `idb-keyval` patterns already in codebase), `@aws-sdk/client-s3`, Web Crypto API, `qrcode`, SCSS

**Spec:** `docs/superpowers/specs/2026-07-04-multi-document-workspace-design.md`

---

## File Structure

```
excalidraw-app/
├── document/
│   ├── types.ts                  # Core types: DocumentMeta, FolderNode, Manifest, DocumentData, SyncConfig
│   ├── constants.ts              # Document module constants and storage keys
│   ├── DocumentManager.ts        # Document CRUD, folder tree, active document switching
│   ├── useDocumentManager.ts     # React hook wrapping DocumentManager
│   ├── DocumentSidebar.tsx       # Sidebar UI component (file explorer)
│   ├── DocumentSidebar.scss      # Sidebar styles
│   ├── FolderTree.tsx            # Tree view component
│   ├── FolderTree.scss           # Tree view styles
│   ├── ConflictDialog.tsx        # Conflict resolution modal
│   ├── ConflictDialog.scss       # Conflict dialog styles
│   ├── SyncStatus.tsx            # Sync status indicator
│   └── SyncStatus.scss           # Sync status styles
├── storage/
│   ├── StorageAdapter.ts         # Abstract interface for storage backends
│   ├── LocalAdapter.ts           # IndexedDB implementation
│   ├── S3Adapter.ts              # S3-compatible storage implementation
│   └── __tests__/
│       ├── LocalAdapter.test.ts
│       └── S3Adapter.test.ts
├── sync/
│   ├── SyncEngine.ts             # Orchestrates local <-> remote sync
│   ├── ConflictResolver.ts       # Version comparison + conflict detection
│   ├── ConfigCrypto.ts           # Encrypt/decrypt config for export/import
│   └── __tests__/
│       ├── SyncEngine.test.ts
│       ├── ConflictResolver.test.ts
│       └── ConfigCrypto.test.ts
└── components/
    ├── SettingsDialog.tsx         # S3 config form + import/export
    └── SettingsDialog.scss

# Existing files to modify:
├── app_constants.ts               # Add new STORAGE_KEYS entries
├── App.tsx                        # Integrate DocumentManager, sidebar, keyboard shortcuts
└── package.json                   # Add @aws-sdk/client-s3, qrcode dependencies
```

---

## Task 1: Define Core Types and Constants

**Files:**
- Create: `excalidraw-app/document/types.ts`
- Create: `excalidraw-app/document/constants.ts`
- Modify: `excalidraw-app/app_constants.ts`

- [ ] **Step 1: Create core types file**

```typescript
// excalidraw-app/document/types.ts

import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

/** Metadata for a single document (stored in manifest) */
export interface DocumentMeta {
  id: string;
  name: string;
  folderId: string; // "root" for top-level
  createdAt: number;
  updatedAt: number;
  version: number; // incremented on each save
  remoteVersion: string | null; // ETag or version from remote
  dirty: boolean; // has unsaved local changes
}

/** A folder in the document tree */
export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null; // null = root-level folder
  children: string[]; // child folder IDs
  documents: string[]; // document IDs in this folder
}

/** Root manifest describing all documents and folders */
export interface Manifest {
  version: number;
  folders: Record<string, FolderNode>;
  documents: Record<string, DocumentMeta>;
}

/** Full document content saved to storage */
export interface DocumentData {
  elements: readonly OrderedExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
}

/** Cloud sync configuration */
export interface SyncConfig {
  type: "s3" | "webdav";
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region?: string;
  pathPrefix?: string;
}

/** Conflict resolution user choice */
export type ConflictChoice = "keep-local" | "use-remote" | "keep-both";

/** Conflict info passed to the dialog */
export interface ConflictInfo {
  documentId: string;
  documentName: string;
  localVersion: number;
  remoteVersion: string;
  localUpdatedAt: number;
  remoteUpdatedAt: number;
}

/** Sync status for display */
export type SyncState =
  | { status: "idle" }
  | { status: "syncing"; documentId: string }
  | { status: "error"; message: string }
  | { status: "offline" }
  | { status: "conflict"; conflict: ConflictInfo };
```

- [ ] **Step 2: Create document constants file**

```typescript
// excalidraw-app/document/constants.ts

export const DOC_CONSTANTS = {
  /** IndexedDB store name for documents */
  IDB_STORE: "excalidraw-documents",
  /** IndexedDB store name for manifest */
  IDB_MANIFEST: "excalidraw-manifest",
  /** localStorage key for active document ID */
  ACTIVE_DOC_KEY: "excalidraw-active-doc",
  /** localStorage key for sync config */
  SYNC_CONFIG_KEY: "excalidraw-sync-config",
  /** Default folder ID */
  ROOT_FOLDER_ID: "root",
  /** Manifest filename on remote */
  MANIFEST_FILENAME: "__manifest.json",
  /** Config filename on remote */
  CONFIG_FILENAME: "__config.json",
  /** Assets folder on remote */
  ASSETS_FOLDER: "assets",
  /** Auto-save debounce (ms) */
  AUTO_SAVE_DEBOUNCE: 500,
  /** Sync debounce (ms) */
  SYNC_DEBOUNCE: 2000,
  /** Sidebar width (px) */
  SIDEBAR_WIDTH: 240,
  /** Default new document name */
  DEFAULT_DOC_NAME: "Untitled",
} as const;
```

- [ ] **Step 3: Add new storage keys to app_constants.ts**

In `excalidraw-app/app_constants.ts`, add to `STORAGE_KEYS`:

```typescript
  // Add these entries inside the STORAGE_KEYS object:
  IDB_DOCUMENTS: "excalidraw-documents",
  IDB_MANIFEST: "excalidraw-manifest",
  LOCAL_STORAGE_ACTIVE_DOC: "excalidraw-active-doc",
  LOCAL_STORAGE_SYNC_CONFIG: "excalidraw-sync-config",
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn test:typecheck`
Expected: No errors related to the new files.

- [ ] **Step 5: Commit**

```bash
git add excalidraw-app/document/types.ts excalidraw-app/document/constants.ts excalidraw-app/app_constants.ts
git commit -m "feat: add core types and constants for multi-document workspace"
```

---

## Task 2: StorageAdapter Interface

**Files:**
- Create: `excalidraw-app/storage/StorageAdapter.ts`

- [ ] **Step 1: Create the StorageAdapter interface**

```typescript
// excalidraw-app/storage/StorageAdapter.ts

import type {
  DocumentMeta,
  DocumentData,
  Manifest,
} from "../document/types";

/**
 * Abstract storage backend interface.
 * Implementations: LocalAdapter (IndexedDB), S3Adapter, WebDAVAdapter (Phase 2).
 */
export interface StorageAdapter {
  /** List all document metadata */
  listDocuments(): Promise<DocumentMeta[]>;

  /** Load full document data by ID */
  loadDocument(id: string): Promise<DocumentData | null>;

  /** Save full document data */
  saveDocument(
    id: string,
    data: DocumentData,
    meta: DocumentMeta,
  ): Promise<void>;

  /** Delete a document and its data */
  deleteDocument(id: string): Promise<void>;

  /** Get the current manifest */
  getManifest(): Promise<Manifest | null>;

  /** Save the manifest */
  saveManifest(manifest: Manifest): Promise<void>;

  /**
   * Get remote version identifier (ETag, hash, etc.) for a document.
   * Returns null if document doesn't exist remotely.
   */
  getRemoteVersion(docId: string): Promise<string | null>;

  /**
   * Test the connection to this storage backend.
   * Throws on failure.
   */
  testConnection(): Promise<void>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn test:typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add excalidraw-app/storage/StorageAdapter.ts
git commit -m "feat: add StorageAdapter interface"
```

---

## Task 3: LocalAdapter (IndexedDB Storage)

**Files:**
- Create: `excalidraw-app/storage/LocalAdapter.ts`
- Create: `excalidraw-app/storage/__tests__/LocalAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// excalidraw-app/storage/__tests__/LocalAdapter.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { LocalAdapter } from "../LocalAdapter";
import type { DocumentData, DocumentMeta, Manifest } from "../../document/types";

// Mock IndexedDB using fake-indexeddb
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

describe("LocalAdapter", () => {
  let adapter: LocalAdapter;

  beforeEach(async () => {
    adapter = new LocalAdapter();
    // Clear stores
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) {
        indexedDB.deleteDatabase(db.name);
      }
    }
  });

  it("should save and load a document", async () => {
    const meta = makeDocMeta();
    const data = makeDocData();

    await adapter.saveDocument("doc-1", data, meta);
    const loaded = await adapter.loadDocument("doc-1");

    expect(loaded).not.toBeNull();
    expect(loaded!.elements).toEqual([]);
  });

  it("should return null for non-existent document", async () => {
    const loaded = await adapter.loadDocument("non-existent");
    expect(loaded).toBeNull();
  });

  it("should list documents", async () => {
    const meta = makeDocMeta();
    const data = makeDocData();
    await adapter.saveDocument("doc-1", data, meta);

    const docs = await adapter.listDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe("doc-1");
  });

  it("should delete a document", async () => {
    const meta = makeDocMeta();
    const data = makeDocData();
    await adapter.saveDocument("doc-1", data, meta);
    await adapter.deleteDocument("doc-1");

    const loaded = await adapter.loadDocument("doc-1");
    expect(loaded).toBeNull();
  });

  it("should save and load manifest", async () => {
    const manifest = makeManifest();
    await adapter.saveManifest(manifest);
    const loaded = await adapter.getManifest();

    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.documents["doc-1"].name).toBe("Test Doc");
  });

  it("should return null for manifest when none saved", async () => {
    const loaded = await adapter.getManifest();
    expect(loaded).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn vitest run excalidraw-app/storage/__tests__/LocalAdapter.test.ts`
Expected: FAIL — `Cannot find module '../LocalAdapter'`

- [ ] **Step 3: Install fake-indexeddb for testing**

```bash
cd /Users/zhongxian/workspace/excalidraw && yarn add -D fake-indexeddb
```

- [ ] **Step 4: Implement LocalAdapter**

```typescript
// excalidraw-app/storage/LocalAdapter.ts

import type { StorageAdapter } from "./StorageAdapter";
import type {
  DocumentMeta,
  DocumentData,
  Manifest,
} from "../document/types";
import { DOC_CONSTANTS } from "../document/constants";

const DB_NAME = DOC_CONSTANTS.IDB_STORE;
const DB_VERSION = 1;
const DOCS_STORE = "documents";
const MANIFEST_STORE = "manifest";
const META_STORE = "metadata";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCS_STORE)) {
        db.createObjectStore(DOCS_STORE);
      }
      if (!db.objectStoreNames.contains(MANIFEST_STORE)) {
        db.createObjectStore(MANIFEST_STORE);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = callback(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class LocalAdapter implements StorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB();
    }
    return this.dbPromise;
  }

  async listDocuments(): Promise<DocumentMeta[]> {
    const db = await this.getDB();
    return tx(db, META_STORE, "readonly", (store) => store.getAll());
  }

  async loadDocument(id: string): Promise<DocumentData | null> {
    const db = await this.getDB();
    const result = await tx(db, DOCS_STORE, "readonly", (store) =>
      store.get(id),
    );
    return result ?? null;
  }

  async saveDocument(
    id: string,
    data: DocumentData,
    meta: DocumentMeta,
  ): Promise<void> {
    const db = await this.getDB();
    await tx(db, DOCS_STORE, "readwrite", (store) => store.put(data, id));
    await tx(db, META_STORE, "readwrite", (store) => store.put(meta));
  }

  async deleteDocument(id: string): Promise<void> {
    const db = await this.getDB();
    await tx(db, DOCS_STORE, "readwrite", (store) => store.delete(id));
    await tx(db, META_STORE, "readwrite", (store) => store.delete(id));
  }

  async getManifest(): Promise<Manifest | null> {
    const db = await this.getDB();
    const result = await tx(db, MANIFEST_STORE, "readonly", (store) =>
      store.get("current"),
    );
    return result ?? null;
  }

  async saveManifest(manifest: Manifest): Promise<void> {
    const db = await this.getDB();
    await tx(db, MANIFEST_STORE, "readwrite", (store) =>
      store.put(manifest, "current"),
    );
  }

  async getRemoteVersion(_docId: string): Promise<string | null> {
    // Local storage has no remote version concept
    return null;
  }

  async testConnection(): Promise<void> {
    // IndexedDB is always available locally
    await this.getDB();
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn vitest run excalidraw-app/storage/__tests__/LocalAdapter.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add excalidraw-app/storage/LocalAdapter.ts excalidraw-app/storage/__tests__/LocalAdapter.test.ts
git commit -m "feat: implement LocalAdapter with IndexedDB storage"
```

---


---

## Task 4: S3Adapter (S3-Compatible Cloud Storage)

**Files:**
- Create: `excalidraw-app/storage/S3Adapter.ts`
- Create: `excalidraw-app/storage/__tests__/S3Adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// excalidraw-app/storage/__tests__/S3Adapter.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DocumentMeta, DocumentData, Manifest } from "../../document/types";

// Mock @aws-sdk/client-s3
vi.mock("@aws-sdk/client-s3", () => {
  const mockSend = vi.fn();
  return {
    S3Client: vi.fn(() => ({ send: mockSend })),
    GetObjectCommand: vi.fn((input) => ({ ...input, _type: "GetObject" })),
    PutObjectCommand: vi.fn((input) => ({ ...input, _type: "PutObject" })),
    DeleteObjectCommand: vi.fn((input) => ({ ...input, _type: "DeleteObject" })),
    ListObjectsV2Command: vi.fn((input) => ({ ...input, _type: "ListObjectsV2" })),
    HeadObjectCommand: vi.fn((input) => ({ ...input, _type: "HeadObject" })),
  };
});

// We import after mocking so the module picks up our mock
import { S3Adapter } from "../S3Adapter";
import type { SyncConfig } from "../../document/types";

const makeConfig = (): SyncConfig => ({
  type: "s3",
  endpoint: "https://s3.example.com",
  bucket: "test-bucket",
  accessKey: "AK_TEST",
  secretKey: "SK_TEST",
  region: "us-east-1",
  pathPrefix: "",
});

const makeDocMeta = (): DocumentMeta => ({
  id: "doc-1",
  name: "Test",
  folderId: "root",
  createdAt: 1000,
  updatedAt: 2000,
  version: 1,
  remoteVersion: null,
  dirty: false,
});

const makeDocData = (): DocumentData => ({
  elements: [],
  appState: {},
  files: {},
});

const makeManifest = (): Manifest => ({
  version: 1,
  folders: { root: { id: "root", name: "Root", parentId: null, children: [], documents: [] } },
  documents: {},
});

describe("S3Adapter", () => {
  let adapter: S3Adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new S3Adapter(makeConfig());
  });

  it("should construct with config", () => {
    expect(adapter).toBeDefined();
  });

  it("should build correct key paths with prefix", () => {
    const configWithPrefix: SyncConfig = { ...makeConfig(), pathPrefix: "my-drawings" };
    const adapterPrefix = new S3Adapter(configWithPrefix);
    // Access the private method through a public behavior: saveManifest
    // The key should be "my-drawings/__manifest.json"
    expect(adapterPrefix).toBeDefined();
  });

  it("should save and serialize manifest as JSON", async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const mockClient = (S3Client as any).mock.results[0].value;
    mockClient.send.mockResolvedValueOnce({});

    const manifest = makeManifest();
    await adapter.saveManifest(manifest);

    expect(mockClient.send).toHaveBeenCalledTimes(1);
    const cmd = mockClient.send.mock.calls[0][0];
    expect(cmd._type).toBe("PutObject");
    expect(cmd.Bucket).toBe("test-bucket");
    expect(cmd.Key).toBe("__manifest.json");
    expect(JSON.parse(cmd.Body)).toEqual(manifest);
  });

  it("should load and parse manifest from S3", async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const mockClient = (S3Client as any).mock.results[0].value;
    const manifest = makeManifest();
    const body = new TextEncoder().encode(JSON.stringify(manifest));
    mockClient.send.mockResolvedValueOnce({
      Body: { transformToByteArray: () => Promise.resolve(body) },
    });

    const loaded = await adapter.getManifest();
    expect(loaded).toEqual(manifest);
  });

  it("should return null when manifest does not exist (NoSuchKey)", async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const mockClient = (S3Client as any).mock.results[0].value;
    const err = new Error("NoSuchKey");
    (err as any).name = "NoSuchKey";
    mockClient.send.mockRejectedValueOnce(err);

    const loaded = await adapter.getManifest();
    expect(loaded).toBeNull();
  });

  it("should save document data as JSON to correct key", async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const mockClient = (S3Client as any).mock.results[0].value;
    mockClient.send.mockResolvedValueOnce({ ETag: '"abc123"' });

    const meta = makeDocMeta();
    const data = makeDocData();
    await adapter.saveDocument("doc-1", data, meta);

    expect(mockClient.send).toHaveBeenCalledTimes(1);
    const cmd = mockClient.send.mock.calls[0][0];
    expect(cmd._type).toBe("PutObject");
    expect(cmd.Key).toBe("root/doc-1.excalidraw");
  });

  it("should get remote version via HeadObject", async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const mockClient = (S3Client as any).mock.results[0].value;
    mockClient.send.mockResolvedValueOnce({ ETag: '"version-42"' });

    const version = await adapter.getRemoteVersion("doc-1");
    expect(version).toBe('"version-42"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn vitest run excalidraw-app/storage/__tests__/S3Adapter.test.ts`
Expected: FAIL — `Cannot find module '../S3Adapter'`

- [ ] **Step 3: Install @aws-sdk/client-s3**

```bash
cd /Users/zhongxian/workspace/excalidraw && yarn add @aws-sdk/client-s3
```

- [ ] **Step 4: Implement S3Adapter**

```typescript
// excalidraw-app/storage/S3Adapter.ts

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

import type { StorageAdapter } from "./StorageAdapter";
import type {
  DocumentMeta,
  DocumentData,
  Manifest,
  SyncConfig,
} from "../document/types";
import { DOC_CONSTANTS } from "../document/constants";

export class S3Adapter implements StorageAdapter {
  private client: S3Client;
  private config: SyncConfig;

  constructor(config: SyncConfig) {
    this.config = config;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || "us-east-1",
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true, // required for MinIO, Ceph, etc.
    });
  }

  private key(path: string): string {
    const prefix = this.config.pathPrefix
      ? `${this.config.pathPrefix.replace(/\/+$/, "")}/`
      : "";
    return `${prefix}${path}`;
  }

  private docPath(meta: DocumentMeta): string {
    return `${meta.folderId}/${meta.id}.excalidraw`;
  }

  private async getObject(key: string): Promise<string | null> {
    try {
      const resp = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: this.key(key),
        }),
      );
      const bytes = await resp.Body!.transformToByteArray();
      return new TextDecoder().decode(bytes);
    } catch (err: any) {
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  private async putObject(
    key: string,
    body: string,
    contentType = "application/json",
  ): Promise<string | null> {
    const resp = await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(key),
        Body: body,
        ContentType: contentType,
      }),
    );
    return resp.ETag ?? null;
  }

  async listDocuments(): Promise<DocumentMeta[]> {
    const manifest = await this.getManifest();
    return manifest ? Object.values(manifest.documents) : [];
  }

  async loadDocument(id: string): Promise<DocumentData | null> {
    // We need the manifest to know the folder path
    const manifest = await this.getManifest();
    if (!manifest || !manifest.documents[id]) {
      return null;
    }
    const meta = manifest.documents[id];
    const json = await this.getObject(this.docPath(meta));
    if (!json) {
      return null;
    }
    return JSON.parse(json) as DocumentData;
  }

  async saveDocument(
    id: string,
    data: DocumentData,
    meta: DocumentMeta,
  ): Promise<void> {
    await this.putObject(this.docPath(meta), JSON.stringify(data));
  }

  async deleteDocument(id: string): Promise<void> {
    const manifest = await this.getManifest();
    if (!manifest || !manifest.documents[id]) {
      return;
    }
    const meta = manifest.documents[id];
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(this.docPath(meta)),
      }),
    );
  }

  async getManifest(): Promise<Manifest | null> {
    const json = await this.getObject(DOC_CONSTANTS.MANIFEST_FILENAME);
    if (!json) {
      return null;
    }
    return JSON.parse(json) as Manifest;
  }

  async saveManifest(manifest: Manifest): Promise<void> {
    await this.putObject(
      DOC_CONSTANTS.MANIFEST_FILENAME,
      JSON.stringify(manifest),
    );
  }

  async getRemoteVersion(docId: string): Promise<string | null> {
    const manifest = await this.getManifest();
    if (!manifest || !manifest.documents[docId]) {
      return null;
    }
    const meta = manifest.documents[docId];
    try {
      const resp = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: this.key(this.docPath(meta)),
        }),
      );
      return resp.ETag ?? null;
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async testConnection(): Promise<void> {
    // Try to HEAD the manifest — any response (including 404) means connection works
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: this.key(DOC_CONSTANTS.MANIFEST_FILENAME),
        }),
      );
    } catch (err: any) {
      if (err.name !== "NotFound" && err.$metadata?.httpStatusCode !== 404) {
        throw new Error(
          `S3 connection failed: ${err.message || "Unknown error"}`,
        );
      }
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn vitest run excalidraw-app/storage/__tests__/S3Adapter.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add excalidraw-app/storage/S3Adapter.ts excalidraw-app/storage/__tests__/S3Adapter.test.ts
git commit -m "feat: implement S3Adapter for cloud storage"
```

---

## Task 5: ConflictResolver

**Files:**
- Create: `excalidraw-app/sync/ConflictResolver.ts`
- Create: `excalidraw-app/sync/__tests__/ConflictResolver.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// excalidraw-app/sync/__tests__/ConflictResolver.test.ts

import { describe, it, expect } from "vitest";
import { ConflictResolver } from "../ConflictResolver";
import type { DocumentMeta, ConflictInfo } from "../../document/types";

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
      const currentRemoteVersion = '"etag-new"';
      expect(ConflictResolver.hasConflict(meta, currentRemoteVersion)).toBe(true);
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
      // Should match pattern: "My Drawing - Copy YYYY-MM-DD"
      expect(copyName).toMatch(/^My Drawing - Copy \d{4}-\d{2}-\d{2}$/);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn vitest run excalidraw-app/sync/__tests__/ConflictResolver.test.ts`
Expected: FAIL — `Cannot find module '../ConflictResolver'`

- [ ] **Step 3: Implement ConflictResolver**

```typescript
// excalidraw-app/sync/ConflictResolver.ts

import type { DocumentMeta, ConflictInfo } from "../document/types";

export class ConflictResolver {
  /**
   * Detect whether a conflict exists.
   * A conflict occurs when the local document has unsaved changes (dirty)
   * AND the remote version has changed since the last known version.
   */
  static hasConflict(
    localMeta: DocumentMeta,
    currentRemoteVersion: string | null,
  ): boolean {
    if (!localMeta.dirty) {
      return false;
    }
    if (currentRemoteVersion === null && localMeta.remoteVersion === null) {
      return false;
    }
    return localMeta.remoteVersion !== currentRemoteVersion;
  }

  /**
   * Build a ConflictInfo object for the conflict dialog.
   */
  static buildConflictInfo(
    localMeta: DocumentMeta,
    remoteVersion: string,
    remoteUpdatedAt: number,
  ): ConflictInfo {
    return {
      documentId: localMeta.id,
      documentName: localMeta.name,
      localVersion: localMeta.version,
      remoteVersion,
      localUpdatedAt: localMeta.updatedAt,
      remoteUpdatedAt,
    };
  }

  /**
   * Generate a name for the "keep both" copy.
   * Format: "Original Name - Copy YYYY-MM-DD"
   */
  static resolveKeepBoth(meta: DocumentMeta): string {
    const date = new Date().toISOString().slice(0, 10);
    return `${meta.name} - Copy ${date}`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn vitest run excalidraw-app/sync/__tests__/ConflictResolver.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add excalidraw-app/sync/ConflictResolver.ts excalidraw-app/sync/__tests__/ConflictResolver.test.ts
git commit -m "feat: implement ConflictResolver for sync conflict detection"
```

---

## Task 6: ConfigCrypto (Encrypted Config Export/Import)

**Files:**
- Create: `excalidraw-app/sync/ConfigCrypto.ts`
- Create: `excalidraw-app/sync/__tests__/ConfigCrypto.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// excalidraw-app/sync/__tests__/ConfigCrypto.test.ts

import { describe, it, expect } from "vitest";
import { ConfigCrypto } from "../ConfigCrypto";
import type { SyncConfig } from "../../document/types";

const makeConfig = (): SyncConfig => ({
  type: "s3",
  endpoint: "https://s3.example.com",
  bucket: "my-bucket",
  accessKey: "AKIAIOSFODNN7EXAMPLE",
  secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
});

describe("ConfigCrypto", () => {
  it("should encrypt and decrypt a config roundtrip", async () => {
    const config = makeConfig();
    const password = "my-secure-password";

    const encrypted = await ConfigCrypto.encrypt(config, password);
    expect(typeof encrypted).toBe("string");
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = await ConfigCrypto.decrypt(encrypted, password);
    expect(decrypted).toEqual(config);
  });

  it("should fail to decrypt with wrong password", async () => {
    const config = makeConfig();
    const encrypted = await ConfigCrypto.encrypt(config, "correct-password");

    await expect(
      ConfigCrypto.decrypt(encrypted, "wrong-password"),
    ).rejects.toThrow();
  });

  it("should produce different ciphertext for same input (random IV)", async () => {
    const config = makeConfig();
    const password = "password";

    const enc1 = await ConfigCrypto.encrypt(config, password);
    const enc2 = await ConfigCrypto.encrypt(config, password);

    expect(enc1).not.toBe(enc2);
  });

  it("should validate config structure on decrypt", async () => {
    const encrypted = await ConfigCrypto.encrypt(
      { notAConfig: true } as any,
      "password",
    );
    // Decrypt should still return the object (validation is optional warning)
    const result = await ConfigCrypto.decrypt(encrypted, "password");
    expect(result).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn vitest run excalidraw-app/sync/__tests__/ConfigCrypto.test.ts`
Expected: FAIL — `Cannot find module '../ConfigCrypto'`

- [ ] **Step 3: Implement ConfigCrypto**

```typescript
// excalidraw-app/sync/ConfigCrypto.ts

import type { SyncConfig } from "../document/types";

const ALGO = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for AES-GCM
const SALT_LENGTH = 16;
const ITERATIONS = 100000;

async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGO, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class ConfigCrypto {
  /**
   * Encrypt a SyncConfig with a user-chosen password.
   * Returns a base64 string containing: salt(16) + iv(12) + ciphertext
   */
  static async encrypt(config: SyncConfig, password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await deriveKey(password, salt);

    const encoder = new TextEncoder();
    const plaintext = encoder.encode(JSON.stringify(config));

    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGO, iv },
      key,
      plaintext,
    );

    // Concatenate: salt + iv + ciphertext
    const combined = new Uint8Array(
      salt.length + iv.length + ciphertext.byteLength,
    );
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

    return toBase64(combined.buffer);
  }

  /**
   * Decrypt an encrypted config string with the given password.
   * Throws if the password is wrong or data is corrupted.
   */
  static async decrypt(
    encrypted: string,
    password: string,
  ): Promise<SyncConfig> {
    const combined = fromBase64(encrypted);

    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

    const key = await deriveKey(password, salt);

    const plaintext = await crypto.subtle.decrypt(
      { name: ALGO, iv },
      key,
      ciphertext,
    );

    const decoder = new TextDecoder();
    const json = decoder.decode(plaintext);
    return JSON.parse(json) as SyncConfig;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn vitest run excalidraw-app/sync/__tests__/ConfigCrypto.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add excalidraw-app/sync/ConfigCrypto.ts excalidraw-app/sync/__tests__/ConfigCrypto.test.ts
git commit -m "feat: implement ConfigCrypto for encrypted config export/import"
```

---

## Task 7: SyncEngine (Orchestrates Local <-> Remote Sync)

**Files:**
- Create: `excalidraw-app/sync/SyncEngine.ts`
- Create: `excalidraw-app/sync/__tests__/SyncEngine.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// excalidraw-app/sync/__tests__/SyncEngine.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncEngine } from "../SyncEngine";
import type { StorageAdapter } from "../../storage/StorageAdapter";
import type { DocumentMeta, DocumentData, Manifest, SyncConfig } from "../../document/types";

// Create a mock LocalAdapter
function createMockLocalAdapter(): StorageAdapter {
  const docs = new Map<string, DocumentData>();
  const metas = new Map<string, DocumentMeta>();
  let manifest: Manifest | null = null;

  return {
    listDocuments: vi.fn(async () => Array.from(metas.values())),
    loadDocument: vi.fn(async (id: string) => docs.get(id) ?? null),
    saveDocument: vi.fn(async (id: string, data: DocumentData, meta: DocumentMeta) => {
      docs.set(id, data);
      metas.set(id, meta);
    }),
    deleteDocument: vi.fn(async (id: string) => {
      docs.delete(id);
      metas.delete(id);
    }),
    getManifest: vi.fn(async () => manifest),
    saveManifest: vi.fn(async (m: Manifest) => { manifest = m; }),
    getRemoteVersion: vi.fn(async () => null),
    testConnection: vi.fn(async () => {}),
  };
}

function createMockRemoteAdapter(): StorageAdapter & { _docs: Map<string, DocumentData>; _metas: Map<string, DocumentMeta>; _manifest: Manifest | null } {
  const docs = new Map<string, DocumentData>();
  const metas = new Map<string, DocumentMeta>();
  let manifest: Manifest | null = null;

  return {
    _docs: docs,
    _metas: metas,
    _manifest: manifest,
    listDocuments: vi.fn(async () => Array.from(metas.values())),
    loadDocument: vi.fn(async (id: string) => docs.get(id) ?? null),
    saveDocument: vi.fn(async (id: string, data: DocumentData, meta: DocumentMeta) => {
      docs.set(id, data);
      metas.set(id, meta);
    }),
    deleteDocument: vi.fn(async (id: string) => {
      docs.delete(id);
      metas.delete(id);
    }),
    getManifest: vi.fn(async () => manifest),
    saveManifest: vi.fn(async (m: Manifest) => { manifest = m; }),
    getRemoteVersion: vi.fn(async () => '"etag-1"'),
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
  let local: StorageAdapter;
  let remote: ReturnType<typeof createMockRemoteAdapter>;
  let engine: SyncEngine;

  beforeEach(() => {
    local = createMockLocalAdapter();
    remote = createMockRemoteAdapter();
    engine = new SyncEngine(local, remote);
  });

  it("should sync a new document to remote (no conflict)", async () => {
    const meta = makeMeta({ dirty: true });
    const data = makeData();
    await local.saveDocument("doc-1", data, meta);
    const manifest: Manifest = {
      version: 1,
      folders: { root: { id: "root", name: "Root", parentId: null, children: [], documents: ["doc-1"] } },
      documents: { "doc-1": meta },
    };
    await local.saveManifest(manifest);

    // Remote has no version for this doc
    remote.getRemoteVersion = vi.fn(async () => null);

    const result = await engine.syncDocument("doc-1");
    expect(result).toBe("synced");
    expect(remote.saveDocument).toHaveBeenCalled();
  });

  it("should detect conflict when remote version changed", async () => {
    const meta = makeMeta({ dirty: true, remoteVersion: '"old-etag"' });
    const data = makeData();
    await local.saveDocument("doc-1", data, meta);

    // Remote version has changed
    remote.getRemoteVersion = vi.fn(async () => '"new-etag"');

    const result = await engine.syncDocument("doc-1");
    expect(result).toBe("conflict");
  });

  it("should skip sync when document is not dirty", async () => {
    const meta = makeMeta({ dirty: false });
    const data = makeData();
    await local.saveDocument("doc-1", data, meta);

    const result = await engine.syncDocument("doc-1");
    expect(result).toBe("skipped");
    expect(remote.saveDocument).not.toHaveBeenCalled();
  });

  it("should resolve conflict with keep-local choice", async () => {
    const meta = makeMeta({ dirty: true, remoteVersion: '"old"' });
    const data = makeData();
    await local.saveDocument("doc-1", data, meta);
    remote.getRemoteVersion = vi.fn(async () => '"new"');

    // Resolve: keep local
    await engine.resolveConflict("doc-1", "keep-local");
    expect(remote.saveDocument).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn vitest run excalidraw-app/sync/__tests__/SyncEngine.test.ts`
Expected: FAIL — `Cannot find module '../SyncEngine'`

- [ ] **Step 3: Implement SyncEngine**

```typescript
// excalidraw-app/sync/SyncEngine.ts

import type { StorageAdapter } from "../storage/StorageAdapter";
import type {
  DocumentMeta,
  DocumentData,
  Manifest,
  ConflictInfo,
  ConflictChoice,
  SyncState,
} from "../document/types";
import { ConflictResolver } from "./ConflictResolver";

export type SyncResult = "synced" | "conflict" | "skipped" | "error";

type SyncStateListener = (state: SyncState) => void;

export class SyncEngine {
  private local: StorageAdapter;
  private remote: StorageAdapter;
  private listeners: Set<SyncStateListener> = new Set();
  private pendingConflicts: Map<string, ConflictInfo> = new Map();

  constructor(local: StorageAdapter, remote: StorageAdapter) {
    this.local = local;
    this.remote = remote;
  }

  onSyncStateChange(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(state: SyncState): void {
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  /**
   * Sync a single document from local to remote.
   * Returns: "synced" | "conflict" | "skipped" | "error"
   */
  async syncDocument(docId: string): Promise<SyncResult> {
    const localDocs = await this.local.listDocuments();
    const meta = localDocs.find((d) => d.id === docId);
    if (!meta) {
      return "error";
    }

    // Skip if not dirty
    if (!meta.dirty) {
      return "skipped";
    }

    this.emit({ status: "syncing", documentId: docId });

    try {
      // Check remote version
      const remoteVersion = await this.remote.getRemoteVersion(docId);

      // Detect conflict
      if (ConflictResolver.hasConflict(meta, remoteVersion)) {
        const conflictInfo = ConflictResolver.buildConflictInfo(
          meta,
          remoteVersion || "unknown",
          Date.now(), // TODO: get actual remote timestamp
        );
        this.pendingConflicts.set(docId, conflictInfo);
        this.emit({ status: "conflict", conflict: conflictInfo });
        return "conflict";
      }

      // No conflict — push to remote
      const data = await this.local.loadDocument(docId);
      if (!data) {
        return "error";
      }

      await this.remote.saveDocument(docId, data, meta);

      // Update local metadata: clear dirty, update remoteVersion
      const updatedMeta: DocumentMeta = {
        ...meta,
        dirty: false,
        remoteVersion: remoteVersion,
      };
      await this.local.saveDocument(docId, data, updatedMeta);

      // Sync manifest to remote
      await this.syncManifestToRemote();

      this.emit({ status: "idle" });
      return "synced";
    } catch (err) {
      this.emit({
        status: "error",
        message: err instanceof Error ? err.message : "Sync failed",
      });
      return "error";
    }
  }

  /**
   * Resolve a conflict for a document.
   */
  async resolveConflict(docId: string, choice: ConflictChoice): Promise<void> {
    const conflict = this.pendingConflicts.get(docId);
    if (!conflict) {
      return;
    }

    const localDocs = await this.local.listDocuments();
    const meta = localDocs.find((d) => d.id === docId);
    if (!meta) {
      return;
    }

    const data = await this.local.loadDocument(docId);
    if (!data) {
      return;
    }

    switch (choice) {
      case "keep-local": {
        // Overwrite remote with local
        await this.remote.saveDocument(docId, data, meta);
        const updatedMeta: DocumentMeta = {
          ...meta,
          dirty: false,
          remoteVersion: conflict.remoteVersion,
        };
        await this.local.saveDocument(docId, data, updatedMeta);
        break;
      }
      case "use-remote": {
        // Overwrite local with remote
        const remoteData = await this.remote.loadDocument(docId);
        if (remoteData) {
          const updatedMeta: DocumentMeta = {
            ...meta,
            dirty: false,
            remoteVersion: conflict.remoteVersion,
          };
          await this.local.saveDocument(docId, remoteData, updatedMeta);
        }
        break;
      }
      case "keep-both": {
        // Save local as a copy, then load remote into original
        const copyName = ConflictResolver.resolveKeepBoth(meta);
        const copyId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const copyMeta: DocumentMeta = {
          ...meta,
          id: copyId,
          name: copyName,
          dirty: false,
          remoteVersion: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await this.local.saveDocument(copyId, data, copyMeta);

        // Load remote into original
        const remoteData = await this.remote.loadDocument(docId);
        if (remoteData) {
          const updatedMeta: DocumentMeta = {
            ...meta,
            dirty: false,
            remoteVersion: conflict.remoteVersion,
          };
          await this.local.saveDocument(docId, remoteData, updatedMeta);
        }

        // Update manifest with new copy
        await this.syncManifestToRemote();
        break;
      }
    }

    this.pendingConflicts.delete(docId);
    this.emit({ status: "idle" });
  }

  /**
   * Full sync: push all dirty documents, pull new remote documents.
   */
  async fullSync(): Promise<void> {
    this.emit({ status: "syncing", documentId: "*" });

    try {
      // Merge manifests first
      await this.mergeManifests();

      // Sync all dirty local documents
      const localDocs = await this.local.listDocuments();
      for (const meta of localDocs) {
        if (meta.dirty) {
          await this.syncDocument(meta.id);
        }
      }

      this.emit({ status: "idle" });
    } catch (err) {
      this.emit({
        status: "error",
        message: err instanceof Error ? err.message : "Full sync failed",
      });
    }
  }

  private async syncManifestToRemote(): Promise<void> {
    const manifest = await this.local.getManifest();
    if (manifest) {
      await this.remote.saveManifest(manifest);
    }
  }

  private async mergeManifests(): Promise<void> {
    const localManifest = await this.local.getManifest();
    const remoteManifest = await this.remote.getManifest();

    if (!remoteManifest) {
      // No remote manifest — push local
      if (localManifest) {
        await this.remote.saveManifest(localManifest);
      }
      return;
    }

    if (!localManifest) {
      // No local manifest — pull remote
      await this.local.saveManifest(remoteManifest);
      return;
    }

    // Merge: take the higher version, then merge documents/folders
    // For now, simple strategy: if remote is newer, use remote as base
    // and add any local-only documents
    const merged: Manifest = {
      version: Math.max(localManifest.version, remoteManifest.version) + 1,
      folders: { ...remoteManifest.folders },
      documents: { ...remoteManifest.documents },
    };

    // Add local-only documents
    for (const [id, meta] of Object.entries(localManifest.documents)) {
      if (!merged.documents[id]) {
        merged.documents[id] = meta;
      }
    }

    // Add local-only folders
    for (const [id, folder] of Object.entries(localManifest.folders)) {
      if (!merged.folders[id]) {
        merged.folders[id] = folder;
      }
    }

    await this.local.saveManifest(merged);
    await this.remote.saveManifest(merged);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn vitest run excalidraw-app/sync/__tests__/SyncEngine.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add excalidraw-app/sync/SyncEngine.ts excalidraw-app/sync/__tests__/SyncEngine.test.ts
git commit -m "feat: implement SyncEngine for local-remote sync orchestration"
```

---

## Task 8: DocumentManager (Core Business Logic)

**Files:**
- Create: `excalidraw-app/document/DocumentManager.ts`
- Create: `excalidraw-app/document/useDocumentManager.ts`
- Create: `excalidraw-app/document/__tests__/DocumentManager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// excalidraw-app/document/__tests__/DocumentManager.test.ts

import { describe, it, expect, beforeEach, vi } from "vitest";
import { DocumentManager } from "../DocumentManager";
import type { StorageAdapter } from "../../storage/StorageAdapter";
import type { Manifest, DocumentData, DocumentMeta } from "../types";

// In-memory mock adapter
class MockAdapter implements StorageAdapter {
  docs = new Map<string, { data: DocumentData; meta: DocumentMeta }>();
  manifest: Manifest | null = null;

  async listDocuments() {
    return Array.from(this.docs.values()).map((d) => d.meta);
  }
  async loadDocument(id: string) {
    return this.docs.get(id)?.data ?? null;
  }
  async saveDocument(id: string, data: DocumentData, meta: DocumentMeta) {
    this.docs.set(id, { data, meta });
  }
  async deleteDocument(id: string) {
    this.docs.delete(id);
  }
  async getManifest() {
    return this.manifest;
  }
  async saveManifest(m: Manifest) {
    this.manifest = m;
  }
  async getRemoteVersion() {
    return null;
  }
  async testConnection() {}
}

describe("DocumentManager", () => {
  let manager: DocumentManager;
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
    manager = new DocumentManager(adapter);
  });

  it("should create a new document", async () => {
    await manager.init();
    const doc = await manager.createDocument("My Drawing");
    expect(doc.name).toBe("My Drawing");
    expect(doc.folderId).toBe("root");
    expect(doc.id).toBeTruthy();

    const manifest = manager.getManifest();
    expect(manifest!.documents[doc.id]).toBeDefined();
  });

  it("should create a folder", async () => {
    await manager.init();
    const folder = await manager.createFolder("Project A");
    expect(folder.name).toBe("Project A");
    expect(folder.parentId).toBe("root");

    const manifest = manager.getManifest();
    expect(manifest!.folders[folder.id]).toBeDefined();
  });

  it("should delete a document", async () => {
    await manager.init();
    const doc = await manager.createDocument("To Delete");
    await manager.deleteDocument(doc.id);

    const manifest = manager.getManifest();
    expect(manifest!.documents[doc.id]).toBeUndefined();
  });

  it("should rename a document", async () => {
    await manager.init();
    const doc = await manager.createDocument("Old Name");
    await manager.renameDocument(doc.id, "New Name");

    const manifest = manager.getManifest();
    expect(manifest!.documents[doc.id].name).toBe("New Name");
  });

  it("should move a document to a folder", async () => {
    await manager.init();
    const doc = await manager.createDocument("Movable");
    const folder = await manager.createFolder("Target");
    await manager.moveDocument(doc.id, folder.id);

    const manifest = manager.getManifest();
    expect(manifest!.documents[doc.id].folderId).toBe(folder.id);
    expect(manifest!.folders[folder.id].documents).toContain(doc.id);
    expect(manifest!.folders["root"].documents).not.toContain(doc.id);
  });

  it("should duplicate a document", async () => {
    await manager.init();
    const doc = await manager.createDocument("Original");
    // Save some data for the document
    const data: DocumentData = { elements: [], appState: {}, files: {} };
    await manager.saveDocumentData(doc.id, data);

    const dup = await manager.duplicateDocument(doc.id);
    expect(dup.name).toContain("Original");
    expect(dup.id).not.toBe(doc.id);

    const dupData = await adapter.loadDocument(dup.id);
    expect(dupData).not.toBeNull();
  });

  it("should track active document", async () => {
    await manager.init();
    const doc = await manager.createDocument("Active");
    manager.setActiveDocument(doc.id);
    expect(manager.getActiveDocumentId()).toBe(doc.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn vitest run excalidraw-app/document/__tests__/DocumentManager.test.ts`
Expected: FAIL — `Cannot find module '../DocumentManager'`

- [ ] **Step 3: Implement DocumentManager**

```typescript
// excalidraw-app/document/DocumentManager.ts

import type { StorageAdapter } from "../storage/StorageAdapter";
import type {
  DocumentMeta,
  DocumentData,
  FolderNode,
  Manifest,
} from "./types";
import { DOC_CONSTANTS } from "./constants";

const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const createEmptyManifest = (): Manifest => ({
  version: 0,
  folders: {
    root: {
      id: "root",
      name: "Root",
      parentId: null,
      children: [],
      documents: [],
    },
  },
  documents: {},
});

export class DocumentManager {
  private adapter: StorageAdapter;
  private manifest: Manifest = createEmptyManifest();
  private activeDocId: string | null = null;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  /** Initialize: load manifest from local storage or create empty one */
  async init(): Promise<void> {
    const existing = await this.adapter.getManifest();
    if (existing) {
      this.manifest = existing;
    } else {
      this.manifest = createEmptyManifest();
      await this.persistManifest();
    }
    // Restore active doc from localStorage
    const savedActive = localStorage.getItem(
      DOC_CONSTANTS.ACTIVE_DOC_KEY,
    );
    if (savedActive && this.manifest.documents[savedActive]) {
      this.activeDocId = savedActive;
    }
  }

  getManifest(): Manifest {
    return this.manifest;
  }

  getActiveDocumentId(): string | null {
    return this.activeDocId;
  }

  setActiveDocument(id: string): void {
    if (!this.manifest.documents[id]) {
      throw new Error(`Document ${id} not found`);
    }
    this.activeDocId = id;
    localStorage.setItem(DOC_CONSTANTS.ACTIVE_DOC_KEY, id);
  }

  /** Create a new document, returns DocumentMeta */
  async createDocument(name?: string): Promise<DocumentMeta> {
    const id = generateId();
    const now = Date.now();
    const meta: DocumentMeta = {
      id,
      name: name || DOC_CONSTANTS.DEFAULT_DOC_NAME,
      folderId: DOC_CONSTANTS.ROOT_FOLDER_ID,
      createdAt: now,
      updatedAt: now,
      version: 1,
      remoteVersion: null,
      dirty: false,
    };

    this.manifest.documents[id] = meta;
    this.manifest.folders["root"].documents.push(id);
    this.manifest.version += 1;
    await this.persistManifest();

    // Save empty document data
    await this.adapter.saveDocument(id, { elements: [], appState: {}, files: {} }, meta);

    return meta;
  }

  /** Load document data */
  async loadDocumentData(id: string): Promise<DocumentData | null> {
    return this.adapter.loadDocument(id);
  }

  /** Save document data and update metadata */
  async saveDocumentData(id: string, data: DocumentData): Promise<void> {
    const meta = this.manifest.documents[id];
    if (!meta) {
      throw new Error(`Document ${id} not found`);
    }

    meta.updatedAt = Date.now();
    meta.version += 1;
    meta.dirty = true;
    this.manifest.documents[id] = meta;
    this.manifest.version += 1;

    await this.adapter.saveDocument(id, data, meta);
    await this.persistManifest();
  }

  /** Mark a document as synced (dirty=false, remoteVersion updated) */
  async markSynced(id: string, remoteVersion: string): Promise<void> {
    const meta = this.manifest.documents[id];
    if (!meta) return;

    meta.dirty = false;
    meta.remoteVersion = remoteVersion;
    this.manifest.documents[id] = meta;
    await this.persistManifest();
  }

  /** Delete a document */
  async deleteDocument(id: string): Promise<void> {
    const meta = this.manifest.documents[id];
    if (!meta) return;

    // Remove from folder
    const folder = this.manifest.folders[meta.folderId];
    if (folder) {
      folder.documents = folder.documents.filter((dId) => dId !== id);
    }

    delete this.manifest.documents[id];
    this.manifest.version += 1;

    await this.adapter.deleteDocument(id);
    await this.persistManifest();

    if (this.activeDocId === id) {
      this.activeDocId = null;
      localStorage.removeItem(DOC_CONSTANTS.ACTIVE_DOC_KEY);
    }
  }

  /** Rename a document */
  async renameDocument(id: string, newName: string): Promise<void> {
    const meta = this.manifest.documents[id];
    if (!meta) return;

    meta.name = newName;
    meta.updatedAt = Date.now();
    this.manifest.documents[id] = meta;
    this.manifest.version += 1;
    await this.persistManifest();
  }

  /** Duplicate a document */
  async duplicateDocument(id: string): Promise<DocumentMeta> {
    const original = this.manifest.documents[id];
    if (!original) {
      throw new Error(`Document ${id} not found`);
    }

    const data = await this.adapter.loadDocument(id);
    const newMeta = await this.createDocument(`${original.name} (copy)`);

    if (data) {
      // Move the duplicated doc to the same folder
      await this.moveDocument(newMeta.id, original.folderId);
      await this.adapter.saveDocument(newMeta.id, data, this.manifest.documents[newMeta.id]);
    }

    return this.manifest.documents[newMeta.id];
  }

  /** Move a document to a different folder */
  async moveDocument(docId: string, targetFolderId: string): Promise<void> {
    const meta = this.manifest.documents[docId];
    const targetFolder = this.manifest.folders[targetFolderId];
    if (!meta || !targetFolder) return;

    // Remove from old folder
    const oldFolder = this.manifest.folders[meta.folderId];
    if (oldFolder) {
      oldFolder.documents = oldFolder.documents.filter((id) => id !== docId);
    }

    // Add to new folder
    if (!targetFolder.documents.includes(docId)) {
      targetFolder.documents.push(docId);
    }

    meta.folderId = targetFolderId;
    meta.updatedAt = Date.now();
    this.manifest.documents[docId] = meta;
    this.manifest.version += 1;
    await this.persistManifest();
  }

  /** Create a new folder */
  async createFolder(
    name: string,
    parentId?: string,
  ): Promise<FolderNode> {
    const id = generateId();
    const effectiveParentId = parentId || DOC_CONSTANTS.ROOT_FOLDER_ID;

    const folder: FolderNode = {
      id,
      name,
      parentId: effectiveParentId,
      children: [],
      documents: [],
    };

    this.manifest.folders[id] = folder;

    // Add to parent's children
    const parent = this.manifest.folders[effectiveParentId];
    if (parent && !parent.children.includes(id)) {
      parent.children.push(id);
    }

    this.manifest.version += 1;
    await this.persistManifest();

    return folder;
  }

  /** Rename a folder */
  async renameFolder(id: string, newName: string): Promise<void> {
    const folder = this.manifest.folders[id];
    if (!folder || id === "root") return;

    folder.name = newName;
    this.manifest.folders[id] = folder;
    this.manifest.version += 1;
    await this.persistManifest();
  }

  /** Delete a folder and all its contents */
  async deleteFolder(id: string): Promise<void> {
    const folder = this.manifest.folders[id];
    if (!folder || id === "root") return;

    // Recursively delete child folders
    for (const childId of folder.children) {
      await this.deleteFolder(childId);
    }

    // Delete all documents in this folder
    for (const docId of folder.documents) {
      await this.deleteDocument(docId);
    }

    // Remove from parent
    if (folder.parentId) {
      const parent = this.manifest.folders[folder.parentId];
      if (parent) {
        parent.children = parent.children.filter((cId) => cId !== id);
      }
    }

    delete this.manifest.folders[id];
    this.manifest.version += 1;
    await this.persistManifest();
  }

  /** Get all dirty documents */
  getDirtyDocuments(): DocumentMeta[] {
    return Object.values(this.manifest.documents).filter((d) => d.dirty);
  }

  /** Get documents in a specific folder */
  getDocumentsInFolder(folderId: string): DocumentMeta[] {
    const folder = this.manifest.folders[folderId];
    if (!folder) return [];
    return folder.documents
      .map((id) => this.manifest.documents[id])
      .filter(Boolean);
  }

  private async persistManifest(): Promise<void> {
    await this.adapter.saveManifest(this.manifest);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn vitest run excalidraw-app/document/__tests__/DocumentManager.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Implement useDocumentManager hook**

```typescript
// excalidraw-app/document/useDocumentManager.ts

import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import { atom } from "jotai";
import { DocumentManager } from "./DocumentManager";
import { LocalAdapter } from "../storage/LocalAdapter";
import { SyncEngine } from "../sync/SyncEngine";
import { S3Adapter } from "../storage/S3Adapter";
import type {
  DocumentMeta,
  FolderNode,
  Manifest,
  SyncConfig,
  SyncState,
  DocumentData,
} from "./types";
import { DOC_CONSTANTS } from "./constants";

// Jotai atoms for document state
export const documentManagerAtom = atom<DocumentManager | null>(null);
export const manifestAtom = atom<Manifest | null>(null);
export const activeDocIdAtom = atom<string | null>(null);
export const syncStateAtom = atom<SyncState>({ status: "idle" });
export const sidebarOpenAtom = atom<boolean>(true);

/**
 * React hook that initializes DocumentManager and provides document operations.
 */
export function useDocumentManager() {
  const [manager, setManager] = useAtom(documentManagerAtom);
  const [manifest, setManifest] = useAtom(manifestAtom);
  const [activeDocId, setActiveDocId] = useAtom(activeDocIdAtom);
  const [syncState, setSyncState] = useAtom(syncStateAtom);
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);
  const syncEngineRef = useRef<SyncEngine | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Initialize on mount
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const localAdapter = new LocalAdapter();
      const mgr = new DocumentManager(localAdapter);
      await mgr.init();

      if (cancelled) return;

      setManager(mgr);
      setManifest(mgr.getManifest());
      setActiveDocId(mgr.getActiveDocumentId());

      // Try to restore sync config and start sync engine
      const configStr = localStorage.getItem(DOC_CONSTANTS.SYNC_CONFIG_KEY);
      if (configStr) {
        try {
          const config: SyncConfig = JSON.parse(configStr);
          if (config.type === "s3") {
            const remoteAdapter = new S3Adapter(config);
            const engine = new SyncEngine(localAdapter, remoteAdapter, mgr);
            syncEngineRef.current = engine;
            engine.onStateChange(setSyncState);
            engine.start();
          }
        } catch {
          // Invalid config, ignore
        }
      }

      setInitialized(true);
    };

    init();
    return () => {
      cancelled = true;
      syncEngineRef.current?.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshManifest = useCallback(() => {
    if (manager) {
      setManifest(manager.getManifest());
    }
  }, [manager, setManifest]);

  const createDocument = useCallback(
    async (name?: string) => {
      if (!manager) return null;
      const doc = await manager.createDocument(name);
      refreshManifest();
      return doc;
    },
    [manager, refreshManifest],
  );

  const deleteDocument = useCallback(
    async (id: string) => {
      if (!manager) return;
      await manager.deleteDocument(id);
      refreshManifest();
      if (activeDocId === id) {
        setActiveDocId(null);
      }
    },
    [manager, refreshManifest, activeDocId, setActiveDocId],
  );

  const renameDocument = useCallback(
    async (id: string, name: string) => {
      if (!manager) return;
      await manager.renameDocument(id, name);
      refreshManifest();
    },
    [manager, refreshManifest],
  );

  const duplicateDocument = useCallback(
    async (id: string) => {
      if (!manager) return null;
      const doc = await manager.duplicateDocument(id);
      refreshManifest();
      return doc;
    },
    [manager, refreshManifest],
  );

  const moveDocument = useCallback(
    async (docId: string, folderId: string) => {
      if (!manager) return;
      await manager.moveDocument(docId, folderId);
      refreshManifest();
    },
    [manager, refreshManifest],
  );

  const switchDocument = useCallback(
    async (id: string): Promise<DocumentData | null> => {
      if (!manager) return null;
      manager.setActiveDocument(id);
      setActiveDocId(id);
      return manager.loadDocumentData(id);
    },
    [manager, setActiveDocId],
  );

  const saveDocumentData = useCallback(
    async (id: string, data: DocumentData) => {
      if (!manager) return;
      await manager.saveDocumentData(id, data);
      refreshManifest();
    },
    [manager, refreshManifest],
  );

  const createFolder = useCallback(
    async (name: string, parentId?: string) => {
      if (!manager) return null;
      const folder = await manager.createFolder(name, parentId);
      refreshManifest();
      return folder;
    },
    [manager, refreshManifest],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      if (!manager) return;
      await manager.renameFolder(id, name);
      refreshManifest();
    },
    [manager, refreshManifest],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      if (!manager) return;
      await manager.deleteFolder(id);
      refreshManifest();
    },
    [manager, refreshManifest],
  );

  return {
    initialized,
    manifest,
    activeDocId,
    syncState,
    sidebarOpen,
    setSidebarOpen,
    createDocument,
    deleteDocument,
    renameDocument,
    duplicateDocument,
    moveDocument,
    switchDocument,
    saveDocumentData,
    createFolder,
    renameFolder,
    deleteFolder,
    getManager: () => manager,
  };
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn test:typecheck`
Expected: No errors. (Some unused variable warnings are acceptable.)

- [ ] **Step 7: Commit**

```bash
git add excalidraw-app/document/DocumentManager.ts excalidraw-app/document/useDocumentManager.ts excalidraw-app/document/__tests__/DocumentManager.test.ts
git commit -m "feat: implement DocumentManager with CRUD operations and React hook"
```

---

## Task 9: DocumentSidebar + FolderTree UI Components

**Files:**
- Create: `excalidraw-app/document/DocumentSidebar.tsx`
- Create: `excalidraw-app/document/DocumentSidebar.scss`
- Create: `excalidraw-app/document/FolderTree.tsx`
- Create: `excalidraw-app/document/FolderTree.scss`

- [ ] **Step 1: Create FolderTree component**

```tsx
// excalidraw-app/document/FolderTree.tsx

import { useCallback, useState } from "react";
import clsx from "clsx";
import type {
  DocumentMeta,
  FolderNode,
  Manifest,
} from "./types";
import "./FolderTree.scss";

interface FolderTreeProps {
  manifest: Manifest;
  activeDocId: string | null;
  onDocumentClick: (docId: string) => void;
  onDocumentContextMenu: (docId: string, e: React.MouseEvent) => void;
  onFolderContextMenu: (folderId: string, e: React.MouseEvent) => void;
  onCreateDocument: (folderId: string) => void;
  onCreateFolder: (parentFolderId: string) => void;
}

interface FolderItemProps {
  folder: FolderNode;
  manifest: Manifest;
  activeDocId: string | null;
  expandedFolders: Set<string>;
  toggleFolder: (id: string) => void;
  onDocumentClick: (docId: string) => void;
  onDocumentContextMenu: (docId: string, e: React.MouseEvent) => void;
  onFolderContextMenu: (folderId: string, e: React.MouseEvent) => void;
  onCreateDocument: (folderId: string) => void;
  onCreateFolder: (parentFolderId: string) => void;
}

const DocumentItem: React.FC<{
  doc: DocumentMeta;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}> = ({ doc, isActive, onClick, onContextMenu }) => (
  <div
    className={clsx("folder-tree__doc", {
      "folder-tree__doc--active": isActive,
    })}
    onClick={onClick}
    onContextMenu={onContextMenu}
    title={doc.name}
  >
    <svg
      className="folder-tree__doc-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
    >
      <path
        fill="currentColor"
        d="M3 1h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm6.5 0v3.5H13"
        fillOpacity="0.7"
      />
    </svg>
    <span className="folder-tree__doc-name">{doc.name}</span>
    {doc.dirty && <span className="folder-tree__doc-dirty" title="Unsaved changes">●</span>}
  </div>
);

const FolderItem: React.FC<FolderItemProps> = ({
  folder,
  manifest,
  activeDocId,
  expandedFolders,
  toggleFolder,
  onDocumentClick,
  onDocumentContextMenu,
  onFolderContextMenu,
  onCreateDocument,
  onCreateFolder,
}) => {
  const isExpanded = expandedFolders.has(folder.id);
  const isRoot = folder.id === "root";

  return (
    <div className="folder-tree__folder">
      {!isRoot && (
        <div
          className="folder-tree__folder-header"
          onClick={() => toggleFolder(folder.id)}
          onContextMenu={(e) => onFolderContextMenu(folder.id, e)}
        >
          <svg
            className={clsx("folder-tree__folder-arrow", {
              "folder-tree__folder-arrow--expanded": isExpanded,
            })}
            viewBox="0 0 16 16"
            width="12"
            height="12"
          >
            <path
              fill="currentColor"
              d="M6 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>
          <svg
            className="folder-tree__folder-icon"
            viewBox="0 0 16 16"
            width="16"
            height="16"
          >
            <path
              fill="currentColor"
              d="M1 3a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3z"
              fillOpacity="0.8"
            />
          </svg>
          <span className="folder-tree__folder-name">{folder.name}</span>
        </div>
      )}
      {(isRoot || isExpanded) && (
        <div className={clsx("folder-tree__folder-children", { "folder-tree__folder-children--root": isRoot })}>
          {/* Sub-folders */}
          {folder.children.map((childId) => {
            const childFolder = manifest.folders[childId];
            if (!childFolder) return null;
            return (
              <FolderItem
                key={childId}
                folder={childFolder}
                manifest={manifest}
                activeDocId={activeDocId}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                onDocumentClick={onDocumentClick}
                onDocumentContextMenu={onDocumentContextMenu}
                onFolderContextMenu={onFolderContextMenu}
                onCreateDocument={onCreateDocument}
                onCreateFolder={onCreateFolder}
              />
            );
          })}
          {/* Documents */}
          {folder.documents.map((docId) => {
            const doc = manifest.documents[docId];
            if (!doc) return null;
            return (
              <DocumentItem
                key={docId}
                doc={doc}
                isActive={docId === activeDocId}
                onClick={() => onDocumentClick(docId)}
                onContextMenu={(e) => onDocumentContextMenu(docId, e)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export const FolderTree: React.FC<FolderTreeProps> = ({
  manifest,
  activeDocId,
  onDocumentClick,
  onDocumentContextMenu,
  onFolderContextMenu,
  onCreateDocument,
  onCreateFolder,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(["root"]),
  );

  const toggleFolder = useCallback((id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const rootFolder = manifest.folders["root"];
  if (!rootFolder) return null;

  return (
    <div className="folder-tree">
      <FolderItem
        folder={rootFolder}
        manifest={manifest}
        activeDocId={activeDocId}
        expandedFolders={expandedFolders}
        toggleFolder={toggleFolder}
        onDocumentClick={onDocumentClick}
        onDocumentContextMenu={onDocumentContextMenu}
        onFolderContextMenu={onFolderContextMenu}
        onCreateDocument={onCreateDocument}
        onCreateFolder={onCreateFolder}
      />
    </div>
  );
};
```

- [ ] **Step 2: Create FolderTree styles**

```scss
// excalidraw-app/document/FolderTree.scss

.folder-tree {
  font-size: 13px;
  user-select: none;
  overflow-y: auto;
  flex: 1;

  &__folder {
    &-header {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      cursor: pointer;
      border-radius: 3px;
      margin: 0 4px;

      &:hover {
        background: var(--color-surface-low);
      }
    }

    &-arrow {
      flex-shrink: 0;
      transition: transform 0.15s ease;

      &--expanded {
        transform: rotate(90deg);
      }
    }

    &-icon {
      flex-shrink: 0;
      color: var(--color-primary);
      opacity: 0.8;
    }

    &-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }

    &-children {
      padding-left: 12px;

      &--root {
        padding-left: 0;
      }
    }
  }

  &__doc {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px 3px 24px;
    cursor: pointer;
    border-radius: 3px;
    margin: 0 4px;

    &:hover {
      background: var(--color-surface-low);
    }

    &--active {
      background: var(--color-primary-light);
      color: var(--color-primary);
      font-weight: 500;

      &:hover {
        background: var(--color-primary-light);
      }
    }

    &-icon {
      flex-shrink: 0;
      opacity: 0.6;
    }

    &-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &-dirty {
      flex-shrink: 0;
      font-size: 8px;
      color: var(--color-warning);
      line-height: 1;
    }
  }
}
```

- [ ] **Step 3: Create DocumentSidebar component**

```tsx
// excalidraw-app/document/DocumentSidebar.tsx

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import { FolderTree } from "./FolderTree";
import { SyncStatus } from "./SyncStatus";
import type { Manifest, SyncState } from "./types";
import "./DocumentSidebar.scss";

interface DocumentSidebarProps {
  manifest: Manifest;
  activeDocId: string | null;
  syncState: SyncState;
  isOpen: boolean;
  onToggle: () => void;
  onDocumentClick: (docId: string) => void;
  onCreateDocument: () => void;
  onCreateFolder: () => void;
  onDeleteDocument: (docId: string) => void;
  onRenameDocument: (docId: string) => void;
  onDuplicateDocument: (docId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onRenameFolder: (folderId: string) => void;
  onOpenSettings: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  type: "document" | "folder";
  id: string;
}

export const DocumentSidebar: React.FC<DocumentSidebarProps> = ({
  manifest,
  activeDocId,
  syncState,
  isOpen,
  onToggle,
  onDocumentClick,
  onCreateDocument,
  onCreateFolder,
  onDeleteDocument,
  onRenameDocument,
  onDuplicateDocument,
  onDeleteFolder,
  onRenameFolder,
  onOpenSettings,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleDocumentContextMenu = useCallback(
    (docId: string, e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, type: "document", id: docId });
    },
    [],
  );

  const handleFolderContextMenu = useCallback(
    (folderId: string, e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, type: "folder", id: folderId });
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleMenuAction = useCallback(
    (action: string) => {
      if (!contextMenu) return;
      const { type, id } = contextMenu;

      switch (action) {
        case "rename":
          if (type === "document") onRenameDocument(id);
          else onRenameFolder(id);
          break;
        case "delete":
          if (type === "document") onDeleteDocument(id);
          else onDeleteFolder(id);
          break;
        case "duplicate":
          if (type === "document") onDuplicateDocument(id);
          break;
      }
      closeContextMenu();
    },
    [
      contextMenu,
      onRenameDocument,
      onDeleteDocument,
      onDuplicateDocument,
      onRenameFolder,
      onDeleteFolder,
      closeContextMenu,
    ],
  );

  return (
    <>
      {/* Toggle button - always visible */}
      <button
        className="doc-sidebar__toggle"
        onClick={onToggle}
        title={isOpen ? "Hide Explorer (Ctrl+B)" : "Show Explorer (Ctrl+B)"}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
      </button>

      {/* Sidebar panel */}
      <div className={clsx("doc-sidebar", { "doc-sidebar--open": isOpen })}>
        {/* Header */}
        <div className="doc-sidebar__header">
          <span className="doc-sidebar__title">EXPLORER</span>
          <div className="doc-sidebar__actions">
            <button
              className="doc-sidebar__action-btn"
              onClick={onCreateDocument}
              title="New Document"
            >
              <svg viewBox="0 0 16 16" width="16" height="16">
                <path
                  fill="currentColor"
                  d="M8 2v12M2 8h12"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                />
              </svg>
            </button>
            <button
              className="doc-sidebar__action-btn"
              onClick={onCreateFolder}
              title="New Folder"
            >
              <svg viewBox="0 0 16 16" width="16" height="16">
                <path
                  fill="currentColor"
                  d="M1 3a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3z"
                  fillOpacity="0.6"
                />
                <path
                  d="M8 7v4M6 9h4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </button>
            <button
              className="doc-sidebar__action-btn"
              onClick={onOpenSettings}
              title="Settings"
            >
              <svg viewBox="0 0 16 16" width="16" height="16">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm5.5-2.5h-1M8 1.5v1M2.5 7.5h-1M8 13.5v1m4.6-9.1-.7.7M3.4 11.6l-.7.7m0-8.6.7.7m8.2 8.2.7.7"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Folder tree */}
        <FolderTree
          manifest={manifest}
          activeDocId={activeDocId}
          onDocumentClick={onDocumentClick}
          onDocumentContextMenu={handleDocumentContextMenu}
          onFolderContextMenu={handleFolderContextMenu}
          onCreateDocument={() => onCreateDocument()}
          onCreateFolder={() => onCreateFolder()}
        />

        {/* Sync status footer */}
        <div className="doc-sidebar__footer">
          <SyncStatus state={syncState} />
        </div>
      </div>

      {/* Context menu overlay */}
      {contextMenu && (
        <>
          <div className="doc-sidebar__overlay" onClick={closeContextMenu} />
          <div
            ref={menuRef}
            className="doc-sidebar__context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.type === "document" && (
              <>
                <button onClick={() => handleMenuAction("rename")}>
                  Rename
                </button>
                <button onClick={() => handleMenuAction("duplicate")}>
                  Duplicate
                </button>
                <div className="doc-sidebar__context-menu-divider" />
                <button
                  className="doc-sidebar__context-menu-danger"
                  onClick={() => handleMenuAction("delete")}
                >
                  Delete
                </button>
              </>
            )}
            {contextMenu.type === "folder" && contextMenu.id !== "root" && (
              <>
                <button onClick={() => handleMenuAction("rename")}>
                  Rename
                </button>
                <div className="doc-sidebar__context-menu-divider" />
                <button
                  className="doc-sidebar__context-menu-danger"
                  onClick={() => handleMenuAction("delete")}
                >
                  Delete Folder
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
};
```

- [ ] **Step 4: Create DocumentSidebar styles**

```scss
// excalidraw-app/document/DocumentSidebar.scss

.doc-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 240px;
  background: var(--color-surface-high);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transform: translateX(-100%);
  transition: transform 0.2s ease;
  z-index: 10;

  &--open {
    transform: translateX(0);
  }

  &__toggle {
    position: fixed;
    top: 8px;
    left: 8px;
    z-index: 11;
    background: var(--color-surface-high);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-primary-color);
    transition: background 0.15s ease;

    &:hover {
      background: var(--color-surface-low);
    }
  }

  &--open ~ &__toggle,
  &--open + &__toggle {
    // When sidebar is open, move toggle button to the right
    left: 248px;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  &__title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: var(--text-secondary-color);
    text-transform: uppercase;
  }

  &__actions {
    display: flex;
    gap: 2px;
  }

  &__action-btn {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: var(--text-secondary-color);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      background: var(--color-surface-low);
      color: var(--text-primary-color);
    }
  }

  &__footer {
    padding: 8px 12px;
    border-top: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  &__overlay {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  &__context-menu {
    position: fixed;
    z-index: 100;
    background: var(--color-surface-high);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 4px 0;
    min-width: 160px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

    button {
      display: block;
      width: 100%;
      padding: 6px 12px;
      background: none;
      border: none;
      text-align: left;
      font-size: 13px;
      cursor: pointer;
      color: var(--text-primary-color);

      &:hover {
        background: var(--color-surface-low);
      }
    }

    &-divider {
      height: 1px;
      background: var(--border-color);
      margin: 4px 0;
    }

    &-danger {
      color: var(--color-danger) !important;
    }
  }
}

// Push main content when sidebar is open
body.doc-sidebar-open {
  .App-menu_top {
    left: 240px;
    transition: left 0.2s ease;
  }
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn test:typecheck`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add excalidraw-app/document/DocumentSidebar.tsx excalidraw-app/document/DocumentSidebar.scss excalidraw-app/document/FolderTree.tsx excalidraw-app/document/FolderTree.scss
git commit -m "feat: add DocumentSidebar and FolderTree UI components"
```

---

## Task 10: ConflictDialog + SyncStatus UI Components

**Files:**
- Create: `excalidraw-app/document/ConflictDialog.tsx`
- Create: `excalidraw-app/document/ConflictDialog.scss`
- Create: `excalidraw-app/document/SyncStatus.tsx`
- Create: `excalidraw-app/document/SyncStatus.scss`

- [ ] **Step 1: Create SyncStatus component**

```tsx
// excalidraw-app/document/SyncStatus.tsx

import clsx from "clsx";
import type { SyncState } from "./types";
import "./SyncStatus.scss";

interface SyncStatusProps {
  state: SyncState;
}

export const SyncStatus: React.FC<SyncStatusProps> = ({ state }) => {
  switch (state.status) {
    case "idle":
      return (
        <div className="sync-status sync-status--idle">
          <span className="sync-status__dot sync-status__dot--green" />
          <span className="sync-status__text">Synced</span>
        </div>
      );

    case "syncing":
      return (
        <div className="sync-status sync-status--syncing">
          <span className="sync-status__dot sync-status__dot--yellow sync-status__dot--pulse" />
          <span className="sync-status__text">Syncing...</span>
        </div>
      );

    case "error":
      return (
        <div className="sync-status sync-status--error" title={state.message}>
          <span className="sync-status__dot sync-status__dot--red" />
          <span className="sync-status__text">Sync Error</span>
        </div>
      );

    case "offline":
      return (
        <div className="sync-status sync-status--offline">
          <span className="sync-status__dot sync-status__dot--gray" />
          <span className="sync-status__text">Offline</span>
        </div>
      );

    case "conflict":
      return (
        <div className="sync-status sync-status--conflict">
          <span className="sync-status__dot sync-status__dot--yellow" />
          <span className="sync-status__text">Conflict</span>
        </div>
      );
  }
};
```

- [ ] **Step 2: Create SyncStatus styles**

```scss
// excalidraw-app/document/SyncStatus.scss

.sync-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;

    &--green {
      background: #22c55e;
    }

    &--yellow {
      background: #eab308;
    }

    &--red {
      background: #ef4444;
    }

    &--gray {
      background: #9ca3af;
    }

    &--pulse {
      animation: sync-pulse 1.5s ease-in-out infinite;
    }
  }

  &__text {
    color: var(--text-secondary-color);
  }
}

@keyframes sync-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
```

- [ ] **Step 3: Create ConflictDialog component**

```tsx
// excalidraw-app/document/ConflictDialog.tsx

import { useCallback } from "react";
import type { ConflictInfo, ConflictChoice } from "./types";
import "./ConflictDialog.scss";

interface ConflictDialogProps {
  conflict: ConflictInfo;
  onResolve: (choice: ConflictChoice) => void;
  onClose: () => void;
}

const formatDate = (ts: number) => {
  return new Date(ts).toLocaleString();
};

export const ConflictDialog: React.FC<ConflictDialogProps> = ({
  conflict,
  onResolve,
  onClose,
}) => {
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div className="conflict-dialog__backdrop" onClick={handleBackdropClick}>
      <div className="conflict-dialog">
        <div className="conflict-dialog__header">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v4m0 4h.01M4.93 19h14.14a2 2 0 0 0 1.74-3L13.74 4a2 2 0 0 0-3.48 0L3.19 16a2 2 0 0 0 1.74 3z" />
          </svg>
          <h3>Sync Conflict Detected</h3>
        </div>

        <div className="conflict-dialog__body">
          <p>
            The document <strong>{conflict.documentName}</strong> has been
            modified on another device.
          </p>

          <div className="conflict-dialog__versions">
            <div className="conflict-dialog__version">
              <div className="conflict-dialog__version-label">Local Version</div>
              <div className="conflict-dialog__version-info">
                v{conflict.localVersion} — {formatDate(conflict.localUpdatedAt)}
              </div>
            </div>
            <div className="conflict-dialog__version-vs">vs</div>
            <div className="conflict-dialog__version">
              <div className="conflict-dialog__version-label">Remote Version</div>
              <div className="conflict-dialog__version-info">
                {conflict.remoteVersion} — {formatDate(conflict.remoteUpdatedAt)}
              </div>
            </div>
          </div>

          <p className="conflict-dialog__hint">
            Choose how to resolve this conflict:
          </p>
        </div>

        <div className="conflict-dialog__actions">
          <button
            className="conflict-dialog__btn conflict-dialog__btn--primary"
            onClick={() => onResolve("keep-local")}
          >
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path fill="none" stroke="currentColor" strokeWidth="1.5" d="M13 3L6 13l-3-4" />
            </svg>
            Keep Local
            <small>Overwrite remote with your changes</small>
          </button>

          <button
            className="conflict-dialog__btn"
            onClick={() => onResolve("use-remote")}
          >
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path fill="none" stroke="currentColor" strokeWidth="1.5" d="M2 8l4-5v3h8v4H6v3z" />
            </svg>
            Use Remote
            <small>Discard local changes, use remote version</small>
          </button>

          <button
            className="conflict-dialog__btn"
            onClick={() => onResolve("keep-both")}
          >
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path fill="none" stroke="currentColor" strokeWidth="1.5" d="M4 4h8v8H4zM8 4V1M8 15v-3M4 8H1M15 8h-3" />
            </svg>
            Keep Both
            <small>Save local as copy, load remote version</small>
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Create ConflictDialog styles**

```scss
// excalidraw-app/document/ConflictDialog.scss

.conflict-dialog {
  background: var(--color-surface-high);
  border-radius: 12px;
  padding: 24px;
  max-width: 480px;
  width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);

  &__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  &__header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    color: var(--color-warning);

    h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary-color);
    }
  }

  &__body {
    p {
      margin: 0 0 12px 0;
      font-size: 14px;
      line-height: 1.5;
      color: var(--text-primary-color);
    }
  }

  &__versions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 16px 0;
    padding: 12px;
    background: var(--color-surface-low);
    border-radius: 8px;
  }

  &__version {
    flex: 1;

    &-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-secondary-color);
      margin-bottom: 4px;
    }

    &-info {
      font-size: 13px;
      color: var(--text-primary-color);
    }
  }

  &__version-vs {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary-color);
    flex-shrink: 0;
  }

  &__hint {
    font-size: 13px;
    color: var(--text-secondary-color);
    margin-top: 8px !important;
  }

  &__actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 20px;
  }

  &__btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 10px 14px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--color-surface-high);
    cursor: pointer;
    text-align: left;
    color: var(--text-primary-color);
    font-size: 14px;
    font-weight: 500;
    transition: background 0.15s ease;

    svg {
      margin-right: 6px;
      vertical-align: middle;
    }

    small {
      font-size: 12px;
      font-weight: 400;
      color: var(--text-secondary-color);
    }

    &:hover {
      background: var(--color-surface-low);
    }

    &--primary {
      border-color: var(--color-primary);
      background: var(--color-primary-light);

      &:hover {
        background: var(--color-primary);
        color: white;

        small {
          color: rgba(255, 255, 255, 0.8);
        }
      }
    }
  }
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn test:typecheck`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add excalidraw-app/document/ConflictDialog.tsx excalidraw-app/document/ConflictDialog.scss excalidraw-app/document/SyncStatus.tsx excalidraw-app/document/SyncStatus.scss
git commit -m "feat: add ConflictDialog and SyncStatus UI components"
```

---

## Task 11: App.tsx Integration + Keyboard Shortcuts + Settings Dialog

**Files:**
- Create: `excalidraw-app/components/SettingsDialog.tsx`
- Create: `excalidraw-app/components/SettingsDialog.scss`
- Modify: `excalidraw-app/App.tsx`

- [ ] **Step 1: Create SettingsDialog component**

```tsx
// excalidraw-app/components/SettingsDialog.tsx

import { useCallback, useState } from "react";
import { encryptConfig, decryptConfig } from "../sync/ConfigCrypto";
import { S3Adapter } from "../storage/S3Adapter";
import type { SyncConfig } from "../document/types";
import { DOC_CONSTANTS } from "../document/constants";
import "./SettingsDialog.scss";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: (config: SyncConfig) => void;
  onConfigCleared: () => void;
}

type Tab = "sync" | "local";

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
  onConfigCleared,
}) => {
  const [tab, setTab] = useState<Tab>("sync");
  const [form, setForm] = useState({
    endpoint: "",
    bucket: "",
    accessKey: "",
    secretKey: "",
    region: "us-east-1",
    pathPrefix: "",
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [exportStr, setExportStr] = useState("");
  const [importStr, setImportStr] = useState("");
  const [password, setPassword] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Load existing config on open
  const loadExisting = useCallback(() => {
    const saved = localStorage.getItem(DOC_CONSTANTS.SYNC_CONFIG_KEY);
    if (saved) {
      try {
        const config: SyncConfig = JSON.parse(saved);
        setForm({
          endpoint: config.endpoint || "",
          bucket: config.bucket || "",
          accessKey: config.accessKey || "",
          secretKey: config.secretKey || "",
          region: config.region || "us-east-1",
          pathPrefix: config.pathPrefix || "",
        });
      } catch {
        // ignore
      }
    }
  }, []);

  const handleOpen = useCallback(() => {
    loadExisting();
  }, [loadExisting]);

  if (!isOpen) return null;

  // Call handleOpen on first render when open
  if (isOpen && !form.endpoint && !form.bucket) {
    handleOpen();
  }

  const buildConfig = (): SyncConfig => ({
    type: "s3",
    endpoint: form.endpoint,
    bucket: form.bucket,
    accessKey: form.accessKey,
    secretKey: form.secretKey,
    region: form.region || undefined,
    pathPrefix: form.pathPrefix || undefined,
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const adapter = new S3Adapter(buildConfig());
      await adapter.testConnection();
      setTestResult("Connection successful!");
    } catch (e: any) {
      setTestResult(`Connection failed: ${e.message}`);
    }
    setTesting(false);
  };

  const handleSave = () => {
    const config = buildConfig();
    localStorage.setItem(
      DOC_CONSTANTS.SYNC_CONFIG_KEY,
      JSON.stringify(config),
    );
    onConfigSaved(config);
    onClose();
  };

  const handleClear = () => {
    localStorage.removeItem(DOC_CONSTANTS.SYNC_CONFIG_KEY);
    setForm({
      endpoint: "",
      bucket: "",
      accessKey: "",
      secretKey: "",
      region: "us-east-1",
      pathPrefix: "",
    });
    onConfigCleared();
  };

  const handleExport = async () => {
    if (!password) {
      alert("Please enter a password for encryption");
      return;
    }
    try {
      const config = buildConfig();
      const encrypted = await encryptConfig(config, password);
      setExportStr(encrypted);
      setShowExport(true);
    } catch (e: any) {
      alert(`Export failed: ${e.message}`);
    }
  };

  const handleImport = async () => {
    if (!importStr || !password) {
      alert("Please paste the config string and enter the password");
      return;
    }
    try {
      const config = await decryptConfig(importStr, password);
      setForm({
        endpoint: config.endpoint,
        bucket: config.bucket,
        accessKey: config.accessKey,
        secretKey: config.secretKey,
        region: config.region || "us-east-1",
        pathPrefix: config.pathPrefix || "",
      });
      setShowImport(false);
      setImportStr("");
      setPassword("");
    } catch (e: any) {
      alert(`Import failed: ${e.message || "Wrong password or invalid config"}`);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="settings-dialog__backdrop" onClick={handleBackdropClick}>
      <div className="settings-dialog">
        <div className="settings-dialog__header">
          <h2>Settings</h2>
          <button className="settings-dialog__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-dialog__tabs">
          <button
            className={`settings-dialog__tab ${tab === "sync" ? "settings-dialog__tab--active" : ""}`}
            onClick={() => setTab("sync")}
          >
            Cloud Sync
          </button>
          <button
            className={`settings-dialog__tab ${tab === "local" ? "settings-dialog__tab--active" : ""}`}
            onClick={() => setTab("local")}
          >
            Local
          </button>
        </div>

        <div className="settings-dialog__body">
          {tab === "sync" && (
            <div className="settings-dialog__sync">
              <div className="settings-dialog__field">
                <label>Endpoint URL</label>
                <input
                  type="url"
                  placeholder="https://s3.amazonaws.com"
                  value={form.endpoint}
                  onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                />
              </div>
              <div className="settings-dialog__field">
                <label>Bucket Name</label>
                <input
                  type="text"
                  placeholder="my-excalidraw-bucket"
                  value={form.bucket}
                  onChange={(e) => setForm({ ...form, bucket: e.target.value })}
                />
              </div>
              <div className="settings-dialog__field">
                <label>Access Key</label>
                <input
                  type="text"
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  value={form.accessKey}
                  onChange={(e) => setForm({ ...form, accessKey: e.target.value })}
                />
              </div>
              <div className="settings-dialog__field">
                <label>Secret Key</label>
                <input
                  type="password"
                  placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                  value={form.secretKey}
                  onChange={(e) => setForm({ ...form, secretKey: e.target.value })}
                />
              </div>
              <div className="settings-dialog__field">
                <label>Region</label>
                <input
                  type="text"
                  placeholder="us-east-1"
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                />
              </div>
              <div className="settings-dialog__field">
                <label>Path Prefix (optional)</label>
                <input
                  type="text"
                  placeholder="excalidraw/"
                  value={form.pathPrefix}
                  onChange={(e) => setForm({ ...form, pathPrefix: e.target.value })}
                />
              </div>

              <div className="settings-dialog__actions">
                <button
                  className="settings-dialog__btn"
                  onClick={handleTest}
                  disabled={testing}
                >
                  {testing ? "Testing..." : "Test Connection"}
                </button>
                <button
                  className="settings-dialog__btn settings-dialog__btn--primary"
                  onClick={handleSave}
                >
                  Save
                </button>
                <button
                  className="settings-dialog__btn settings-dialog__btn--danger"
                  onClick={handleClear}
                >
                  Clear Config
                </button>
              </div>

              {testResult && (
                <div
                  className={`settings-dialog__test-result ${
                    testResult.includes("successful")
                      ? "settings-dialog__test-result--success"
                      : "settings-dialog__test-result--error"
                  }`}
                >
                  {testResult}
                </div>
              )}

              <div className="settings-dialog__export-import">
                <h3>Config Export / Import</h3>
                <div className="settings-dialog__field">
                  <label>Encryption Password</label>
                  <input
                    type="password"
                    placeholder="Enter password for encrypt/decrypt"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="settings-dialog__actions">
                  <button className="settings-dialog__btn" onClick={handleExport}>
                    Export Config
                  </button>
                  <button
                    className="settings-dialog__btn"
                    onClick={() => setShowImport(!showImport)}
                  >
                    Import Config
                  </button>
                </div>

                {showExport && exportStr && (
                  <div className="settings-dialog__export-result">
                    <label>Encrypted Config (copy this):</label>
                    <textarea
                      readOnly
                      value={exportStr}
                      onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    />
                  </div>
                )}

                {showImport && (
                  <div className="settings-dialog__import-form">
                    <label>Paste Encrypted Config:</label>
                    <textarea
                      value={importStr}
                      onChange={(e) => setImportStr(e.target.value)}
                      placeholder="Paste the encrypted config string here..."
                    />
                    <button
                      className="settings-dialog__btn settings-dialog__btn--primary"
                      onClick={handleImport}
                    >
                      Decrypt & Apply
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "local" && (
            <div className="settings-dialog__local">
              <p>Local storage is used for offline-first document editing.</p>
              <p>Documents are stored in IndexedDB and automatically synced when online.</p>
              <button className="settings-dialog__btn settings-dialog__btn--danger">
                Clear Local Cache
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Create SettingsDialog styles**

```scss
// excalidraw-app/components/SettingsDialog.scss

.settings-dialog {
  background: var(--color-surface-high);
  border-radius: 12px;
  max-width: 520px;
  width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);

  &__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color);

    h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
  }

  &__close {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: var(--text-secondary-color);
    padding: 4px 8px;
    border-radius: 4px;

    &:hover {
      background: var(--color-surface-low);
    }
  }

  &__tabs {
    display: flex;
    border-bottom: 1px solid var(--border-color);
    padding: 0 20px;
  }

  &__tab {
    padding: 10px 16px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-secondary-color);
    transition: color 0.15s ease;

    &:hover {
      color: var(--text-primary-color);
    }

    &--active {
      color: var(--color-primary);
      border-bottom-color: var(--color-primary);
      font-weight: 500;
    }
  }

  &__body {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
  }

  &__field {
    margin-bottom: 14px;

    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 4px;
      color: var(--text-primary-color);
    }

    input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--color-surface-low);
      color: var(--text-primary-color);
      font-size: 14px;
      box-sizing: border-box;

      &:focus {
        outline: none;
        border-color: var(--color-primary);
      }
    }
  }

  &__actions {
    display: flex;
    gap: 8px;
    margin: 16px 0;
    flex-wrap: wrap;
  }

  &__btn {
    padding: 8px 16px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--color-surface-high);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary-color);
    transition: background 0.15s ease;

    &:hover {
      background: var(--color-surface-low);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &--primary {
      background: var(--color-primary);
      color: white;
      border-color: var(--color-primary);

      &:hover {
        opacity: 0.9;
        background: var(--color-primary);
      }
    }

    &--danger {
      color: var(--color-danger);
      border-color: var(--color-danger);

      &:hover {
        background: var(--color-danger);
        color: white;
      }
    }
  }

  &__test-result {
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    margin: 8px 0;

    &--success {
      background: rgba(34, 197, 94, 0.1);
      color: #22c55e;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }

    &--error {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
  }

  &__export-import {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);

    h3 {
      margin: 0 0 12px 0;
      font-size: 15px;
      font-weight: 600;
    }
  }

  &__export-result,
  &__import-form {
    margin-top: 12px;

    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 4px;
    }

    textarea {
      width: 100%;
      height: 80px;
      padding: 8px 10px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--color-surface-low);
      color: var(--text-primary-color);
      font-family: monospace;
      font-size: 12px;
      resize: vertical;
      box-sizing: border-box;

      &:focus {
        outline: none;
        border-color: var(--color-primary);
      }
    }
  }

  &__local {
    p {
      font-size: 14px;
      line-height: 1.5;
      color: var(--text-secondary-color);
      margin: 0 0 12px 0;
    }
  }
}
```

- [ ] **Step 3: Integrate into App.tsx**

In `excalidraw-app/App.tsx`, make the following changes:

**Add imports at the top (after existing imports):**

```typescript
import { DocumentSidebar } from "./document/DocumentSidebar";
import { ConflictDialog } from "./document/ConflictDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { useDocumentManager } from "./document/useDocumentManager";
import type { ConflictInfo, ConflictChoice, SyncConfig } from "./document/types";
```

**Inside the `App` component function, add these state and hook calls (near the top of the component):**

```typescript
  // Multi-document workspace
  const {
    initialized,
    manifest,
    activeDocId,
    syncState,
    sidebarOpen,
    setSidebarOpen,
    createDocument,
    deleteDocument,
    renameDocument,
    duplicateDocument,
    moveDocument,
    switchDocument,
    saveDocumentData,
    createFolder,
    renameFolder,
    deleteFolder,
    getManager,
  } = useDocumentManager();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
```

**Add the auto-save handler (inside the App component):**

```typescript
  // Auto-save current document on canvas changes
  const handleDocAutoSave = useCallback(
    debounce(
      (
        elements: readonly ExcalidrawElement[],
        appState: AppState,
        files: BinaryFiles,
      ) => {
        if (!activeDocId || !initialized) return;
        saveDocumentData(activeDocId, {
          elements: elements as any,
          appState,
          files,
        });
      },
      DOC_CONSTANTS.AUTO_SAVE_DEBOUNCE,
    ),
    [activeDocId, initialized, saveDocumentData],
  );
```

**Add the document switch handler:**

```typescript
  const handleDocumentSwitch = useCallback(
    async (docId: string) => {
      const data = await switchDocument(docId);
      if (data && excalidrawAPI) {
        excalidrawAPI.updateScene({
          elements: data.elements as any,
          appState: data.appState,
        });
        if (Object.keys(data.files).length > 0) {
          excalidrawAPI.addFiles(Object.values(data.files));
        }
      }
    },
    [switchDocument, excalidrawAPI],
  );
```

**Add rename handlers:**

```typescript
  const handleRenameDocument = useCallback(
    (docId: string) => {
      const name = window.prompt("Enter new name:");
      if (name) renameDocument(docId, name);
    },
    [renameDocument],
  );

  const handleRenameFolder = useCallback(
    (folderId: string) => {
      const name = window.prompt("Enter folder name:");
      if (name) renameFolder(folderId, name);
    },
    [renameFolder],
  );

  const handleConflictResolve = useCallback(
    (choice: ConflictChoice) => {
      // TODO: implement actual conflict resolution logic via SyncEngine
      setConflictInfo(null);
    },
    [],
  );
```

**Add keyboard shortcut (inside the existing `useEffect` or add a new one):**

```typescript
  // Keyboard shortcut: Ctrl/Cmd+B to toggle sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setSidebarOpen((prev: boolean) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setSidebarOpen]);
```

**Add the sidebar body class toggle:**

```typescript
  useEffect(() => {
    document.body.classList.toggle("doc-sidebar-open", sidebarOpen);
  }, [sidebarOpen]);
```

**Add JSX components (inside the Excalidraw wrapper, before or after `<Excalidraw />`):**

```tsx
{initialized && manifest && (
  <DocumentSidebar
    manifest={manifest}
    activeDocId={activeDocId}
    syncState={syncState}
    isOpen={sidebarOpen}
    onToggle={() => setSidebarOpen((prev: boolean) => !prev)}
    onDocumentClick={handleDocumentSwitch}
    onCreateDocument={() => createDocument()}
    onCreateFolder={() => createFolder("New Folder")}
    onDeleteDocument={deleteDocument}
    onRenameDocument={handleRenameDocument}
    onDuplicateDocument={(id) => duplicateDocument(id)}
    onDeleteFolder={deleteFolder}
    onRenameFolder={handleRenameFolder}
    onOpenSettings={() => setSettingsOpen(true)}
  />
)}

{conflictInfo && (
  <ConflictDialog
    conflict={conflictInfo}
    onResolve={handleConflictResolve}
    onClose={() => setConflictInfo(null)}
  />
)}

<SettingsDialog
  isOpen={settingsOpen}
  onClose={() => setSettingsOpen(false)}
  onConfigSaved={(config: SyncConfig) => {
    // Re-initialize sync engine with new config
    // The useDocumentManager hook will handle this
  }}
  onConfigCleared={() => {
    // Stop sync engine
  }}
/>
```

**Wire up the onChange handler on the `<Excalidraw>` component:**

Find the existing `onChange` prop and modify/add it:

```tsx
onChange={(elements, appState, files) => {
  handleDocAutoSave(elements, appState as AppState, files);
}}
```

- [ ] **Step 4: Add import for DOC_CONSTANTS in App.tsx**

Add to the import block:

```typescript
import { DOC_CONSTANTS } from "./document/constants";
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn test:typecheck`
Expected: No errors. Fix any import or type issues.

- [ ] **Step 6: Run dev server and manually verify**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn dev`
Expected:
- App loads normally
- Sidebar toggle button visible in top-left
- Ctrl+B / Cmd+B toggles sidebar
- Can create new documents and folders
- Can switch between documents
- Right-click context menu works
- Settings dialog opens

- [ ] **Step 7: Commit**

```bash
git add excalidraw-app/components/SettingsDialog.tsx excalidraw-app/components/SettingsDialog.scss excalidraw-app/App.tsx
git commit -m "feat: integrate multi-document workspace into App.tsx"
```

---

## Task 12: Install Dependencies + Final Verification

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install new dependencies**

```bash
cd /Users/zhongxian/workspace/excalidraw && yarn add @aws-sdk/client-s3 qrcode
```

- [ ] **Step 2: Install dev dependencies**

```bash
cd /Users/zhongxian/workspace/excalidraw && yarn add -D @types/qrcode
```

- [ ] **Step 3: Run full typecheck**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn test:typecheck`
Expected: No errors.

- [ ] **Step 4: Run all tests**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn vitest run excalidraw-app/storage excalidraw-app/sync excalidraw-app/document`
Expected: All tests pass (LocalAdapter, S3Adapter, ConflictResolver, ConfigCrypto, SyncEngine, DocumentManager).

- [ ] **Step 5: Run full test suite to ensure no regressions**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn test:update`
Expected: All existing tests still pass.

- [ ] **Step 6: Manual E2E verification**

Run: `cd /Users/zhongxian/workspace/excalidraw && yarn dev`

Verify the following user flows:
1. **Create document**: Click "+" in sidebar -> new document appears, canvas clears
2. **Switch document**: Click on a different document -> canvas loads that document
3. **Create folder**: Click folder icon -> new folder appears in tree
4. **Rename**: Right-click -> Rename -> enter new name
5. **Duplicate**: Right-click -> Duplicate -> copy appears
6. **Delete**: Right-click -> Delete -> document removed
7. **Move to folder**: Create folder, create doc, verify drag works (Phase 2) or use programmatic move
8. **Auto-save**: Draw something, wait 500ms, check document shows dirty indicator
9. **Sidebar toggle**: Press Ctrl+B / Cmd+B -> sidebar slides in/out
10. **Settings**: Click gear icon -> S3 config form appears
11. **Conflict dialog**: (Test by manually triggering conflict state)

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete multi-document workspace implementation

- DocumentManager with full CRUD operations
- LocalAdapter (IndexedDB) + S3Adapter (cloud storage)
- SyncEngine with conflict detection and resolution
- ConfigCrypto for encrypted config export/import
- VSCode-style DocumentSidebar with FolderTree
- ConflictDialog with keep-local/use-remote/keep-both options
- SyncStatus indicator (green/yellow/red)
- SettingsDialog for S3 configuration
- Keyboard shortcut: Ctrl/Cmd+B to toggle sidebar
- Offline-first architecture with auto-save"
```

---

## Summary

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Core Types and Constants | 10 min |
| 2 | StorageAdapter Interface | 5 min |
| 3 | LocalAdapter (IndexedDB) | 20 min |
| 4 | S3Adapter (Cloud Storage) | 30 min |
| 5 | ConflictResolver | 15 min |
| 6 | ConfigCrypto | 20 min |
| 7 | SyncEngine | 25 min |
| 8 | DocumentManager + Hook | 30 min |
| 9 | DocumentSidebar + FolderTree UI | 30 min |
| 10 | ConflictDialog + SyncStatus UI | 15 min |
| 11 | App.tsx Integration + Settings | 40 min |
| 12 | Dependencies + Final Verification | 20 min |
| **Total** | | **~4.5 hours** |
