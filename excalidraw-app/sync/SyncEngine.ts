import { ConflictResolver } from "./ConflictResolver";

import type { StorageAdapter } from "../storage/StorageAdapter";
import type {
  DocumentMeta,
  Manifest,
  ConflictInfo,
  ConflictChoice,
  SyncState,
} from "../document/types";

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

  onStateChange(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(state: SyncState): void {
    this.listeners.forEach((fn) => fn(state));
  }

  async syncDocument(docId: string): Promise<SyncResult> {
    const localDocs = await this.local.listDocuments();
    const meta = localDocs.find((d) => d.id === docId);
    if (!meta) {
      return "error";
    }
    if (!meta.dirty) {
      return "skipped";
    }

    this.emit({ status: "syncing", documentId: docId });

    try {
      const remoteVersion = await this.remote.getRemoteVersion(docId);
      if (ConflictResolver.hasConflict(meta, remoteVersion)) {
        // Auto-resolve: keep remote as original, save local as copy
        const localData = await this.local.loadDocument(docId);
        const remoteData = await this.remote.loadDocument(docId);

        if (remoteData && localData) {
          // 1. Overwrite local document with remote version
          await this.local.saveDocument(docId, remoteData, {
            ...meta,
            dirty: false,
            remoteVersion,
          });

          // 2. Create local copy from the local version
          const copyName = ConflictResolver.resolveKeepBoth(meta);
          const copyId = `doc-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;
          const copyMeta: DocumentMeta = {
            ...meta,
            id: copyId,
            name: copyName,
            dirty: false,
            remoteVersion: null,
            isConflictCopy: true,
            conflictCopyCreatedAt: Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await this.local.saveDocument(copyId, localData, copyMeta);

          // 3. Push copy to remote so other devices see it
          await this.remote.saveDocument(copyId, localData, copyMeta);
        } else if (localData) {
          // Remote doesn't exist (deleted) — just push local
          await this.remote.saveDocument(docId, localData, meta);
          const freshETag = await this.remote.getRemoteVersion(docId);
          await this.local.saveDocument(docId, localData, {
            ...meta,
            dirty: false,
            remoteVersion: freshETag,
          });
        }

        await this.syncManifestToRemote();
        this.emit({ status: "idle" });
        return "conflict";
      }

      // No conflict — normal push
      const data = await this.local.loadDocument(docId);
      if (!data) {
        return "error";
      }

      await this.remote.saveDocument(docId, data, meta);
      const freshRemoteVersion = await this.remote.getRemoteVersion(docId);
      const updatedMeta: DocumentMeta = {
        ...meta,
        dirty: false,
        remoteVersion: freshRemoteVersion,
      };
      await this.local.saveDocument(docId, data, updatedMeta);
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
      case "keep-local":
        await this.remote.saveDocument(docId, data, meta);
        {
          const freshETag = await this.remote.getRemoteVersion(docId);
          await this.local.saveDocument(docId, data, {
            ...meta,
            dirty: false,
            remoteVersion: freshETag,
          });
        }
        break;
      case "use-remote": {
        const remoteData = await this.remote.loadDocument(docId);
        if (remoteData) {
          await this.local.saveDocument(docId, remoteData, {
            ...meta,
            dirty: false,
            remoteVersion: conflict.remoteVersion,
          });
        }
        break;
      }
      case "keep-both": {
        const copyName = ConflictResolver.resolveKeepBoth(meta);
        const copyId = `doc-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        await this.local.saveDocument(copyId, data, {
          ...meta,
          id: copyId,
          name: copyName,
          dirty: false,
          remoteVersion: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const remoteData = await this.remote.loadDocument(docId);
        if (remoteData) {
          await this.local.saveDocument(docId, remoteData, {
            ...meta,
            dirty: false,
            remoteVersion: conflict.remoteVersion,
          });
        }
        await this.syncManifestToRemote();
        break;
      }
    }

    this.pendingConflicts.delete(docId);
    this.emit({ status: "idle" });
  }

  /**
   * Pull-only full sync: fetch remote changes into local IndexedDB.
   * Push is handled separately on document switch (syncDocument).
   */
  async fullSync(): Promise<void> {
    this.emit({ status: "syncing", documentId: "*" });
    try {
      const remoteManifest = await this.remote.getManifest();
      if (!remoteManifest) {
        // No remote data — nothing to pull
        this.emit({ status: "idle" });
        return;
      }

      const localDocs = await this.local.listDocuments();
      const localManifest = await this.local.getManifest();
      const localMap = new Map(
        localDocs.map((d) => [d.id, d] as const),
      );

      // Pull docs where remote version is newer or doc is missing locally
      for (const [docId, remoteMeta] of Object.entries(
        remoteManifest.documents,
      )) {
        const localMeta = localMap.get(docId);
        const needsPull =
          !localMeta ||
          (remoteMeta.version &&
            (!localMeta.version || remoteMeta.version > localMeta.version));
        if (needsPull) {
          const remoteData = await this.remote.loadDocument(docId);
          if (remoteData) {
            await this.local.saveDocument(docId, remoteData, {
              ...remoteMeta,
              dirty: false,
            });
          }
        }
      }

      // Merge manifests: remote is the source of truth, but preserve
      // local-only documents that aren't on remote yet
      const merged: Manifest = {
        version: Math.max(
          (localManifest?.version ?? 0),
          remoteManifest.version,
        ) + 1,
        folders: { ...remoteManifest.folders },
        documents: { ...remoteManifest.documents },
      };
      if (localManifest) {
        for (const [id, m] of Object.entries(localManifest.documents)) {
          if (!merged.documents[id]) {
            merged.documents[id] = m;
          }
        }
        for (const [id, f] of Object.entries(localManifest.folders)) {
          if (!merged.folders[id]) {
            merged.folders[id] = f;
          }
        }
      }
      await this.local.saveManifest(merged);

      this.emit({ status: "idle" });
    } catch (err) {
      this.emit({
        status: "error",
        message: err instanceof Error ? err.message : "Full sync failed",
      });
    }
  }

  public async syncManifestToRemote(): Promise<void> {
    const manifest = await this.local.getManifest();
    if (manifest) {
      await this.remote.saveManifest(manifest);
    }
  }

  public async mergeManifests(): Promise<void> {
    const localManifest = await this.local.getManifest();
    const remoteManifest = await this.remote.getManifest();
    if (!remoteManifest) {
      if (localManifest) {
        await this.remote.saveManifest(localManifest);
      }
      return;
    }
    if (!localManifest) {
      await this.local.saveManifest(remoteManifest);
      return;
    }
    const merged: Manifest = {
      version: Math.max(localManifest.version, remoteManifest.version) + 1,
      folders: { ...remoteManifest.folders },
      documents: { ...remoteManifest.documents },
    };
    for (const [id, m] of Object.entries(localManifest.documents)) {
      if (!merged.documents[id]) {
        merged.documents[id] = m;
      }
    }
    for (const [id, f] of Object.entries(localManifest.folders)) {
      if (!merged.folders[id]) {
        merged.folders[id] = f;
      }
    }
    await this.local.saveManifest(merged);
    await this.remote.saveManifest(merged);
  }
}
