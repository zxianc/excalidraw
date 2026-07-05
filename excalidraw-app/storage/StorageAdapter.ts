import type { DocumentMeta, DocumentData, Manifest } from "../document/types";

/**
 * Abstract storage backend interface.
 * Implementations: LocalAdapter (IndexedDB), S3Adapter, WebDAVAdapter (Phase 2).
 */
export interface StorageAdapter {
  /** List all document metadata */
  listDocuments(): Promise<DocumentMeta[]>;

  /** Load full document data by ID */
  loadDocument(id: string): Promise<DocumentData | null>;

  /** Save full document data, returns remote ETag (or null for local-only) */
  saveDocument(
    id: string,
    data: DocumentData,
    meta: DocumentMeta,
  ): Promise<string | null>;

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

  /**
   * Clear all local data (documents, metadata, manifest).
   * For force-sync scenarios.
   */
  clearAll?(): Promise<void>;
}
