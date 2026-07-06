import type { OrderedExcalidrawElement } from "@excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

/** Metadata for a single document (stored in manifest) */
export interface DocumentMeta {
  id: string;
  name: string;
  folderId: string; // "root" for top-level
  createdAt: number;
  updatedAt: number;
  remoteVersion: string | null; // ETag or version from remote
  dirty: boolean; // has unsaved local changes
  /** True when this document was auto-created by conflict resolution */
  isConflictCopy?: boolean;
  /** Timestamp when the conflict copy was created (banner + highlight fade after 24h) */
  conflictCopyCreatedAt?: number;
  /** Soft-delete tombstone. Doc removed from folder tree but entry kept for sync gossip. */
  deleted?: boolean;
  /** Timestamp when the document was deleted (for potential trash/recycle bin). */
  deletedAt?: number;
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

/** Represents an item currently being renamed inline */
export interface EditingItem {
  type: "document" | "folder";
  id: string;
  name: string;
}
