import { DOC_CONSTANTS } from "../document/constants";

import type { StorageAdapter } from "./StorageAdapter";
import type { DocumentMeta, DocumentData, Manifest } from "../document/types";

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
    return null;
  }

  async testConnection(): Promise<void> {
    await this.getDB();
  }

  async close(): Promise<void> {
    if (this.dbPromise) {
      try {
        const db = await this.dbPromise;
        db.close();
      } catch {
        // silently ignore if DB is already closed or errored
      } finally {
        this.dbPromise = null;
      }
    }
  }
}
