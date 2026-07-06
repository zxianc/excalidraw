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
    console.log(`[syncDocument] START docId=${docId}`);

    const localDocs = await this.local.listDocuments();
    const meta = localDocs.find((d) => d.id === docId);
    if (!meta) {
      console.log(`[syncDocument] → error: meta not found for ${docId}`);
      return "error";
    }
    console.log(
      `[syncDocument] meta: name="${meta.name}" dirty=${meta.dirty} remoteVersion=${meta.remoteVersion}`,
    );

    if (!meta.dirty) {
      console.log(`[syncDocument] → skipped (not dirty)`);
      return "skipped";
    }

    this.emit({ status: "syncing", documentId: docId });

    try {
      let remoteVersion: string | null = null;
      try {
        remoteVersion = await this.remote.getRemoteVersion(docId);
        console.log(`[syncDocument] remoteVersion from headObject: ${remoteVersion}`);
      } catch (err: any) {
        console.log(`[syncDocument] headObject failed: ${err.message}, downgrading to null`);
        remoteVersion = null;
      }

      const hasConflict = ConflictResolver.hasConflict(meta, remoteVersion);

      if (hasConflict) {
        console.log(`[syncDocument] CONFLICT detected, auto-resolving keep-both`);

        // --- Conflict detected: auto-resolve keep-both ---
        const localData = await this.local.loadDocument(docId);
        const remoteData = await this.remote.loadDocument(docId);
        console.log(
          `[syncDocument] conflict: localData=${!!localData} remoteData=${!!remoteData}`,
        );

        // Load current local manifest — we will rebuild it after resolution
        const currentManifest = await this.local.getManifest();
        console.log(
          `[syncDocument] conflict: currentManifest docs count=${
            currentManifest ? Object.keys(currentManifest.documents).length : 0
          }`,
        );

        let copyId: string | null = null;
        let copyName: string | null = null;
        let copyRemoteVersion: string | null = null;

        if (remoteData) {
          // 1. Overwrite local document with remote version
          console.log(`[syncDocument] conflict: overwriting local ${docId} with remote`);
          await this.local.saveDocument(docId, remoteData, {
            ...meta,
            dirty: false,
            remoteVersion,
          });
        }

        if (localData) {
          // 2. Save local version as a conflict copy locally
          copyName = ConflictResolver.resolveKeepBoth(meta);
          copyId = `doc-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;
          console.log(
            `[syncDocument] conflict: creating copy id=${copyId} name="${copyName}"`,
          );
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

          // 3. Push conflict copy to remote so other devices see it.
          // Use the ETag returned by saveDocument directly instead of
          // calling getRemoteVersion (which requires the manifest to be
          // pushed first — a chicken-and-egg problem).
          copyRemoteVersion = await this.remote.saveDocument(copyId, localData, copyMeta);
          copyMeta.remoteVersion = copyRemoteVersion;
          await this.local.saveDocument(copyId, localData, copyMeta);
          console.log(`[syncDocument] conflict: pushed copy to remote, ETag=${copyRemoteVersion}`);
        }

        // 4. Rebuild local manifest so reloadManifest() picks up the new state
        if (currentManifest) {
          if (remoteData) {
            currentManifest.documents[docId] = {
              ...meta,
              dirty: false,
              remoteVersion,
            };
          } else {
            // Remote doc was deleted — push local instead
            const freshETag = await this.remote.getRemoteVersion(docId);
            if (localData) {
              await this.remote.saveDocument(docId, localData, meta);
              await this.local.saveDocument(docId, localData, {
                ...meta,
                dirty: false,
                remoteVersion: freshETag,
              });
              currentManifest.documents[docId] = {
                ...meta,
                dirty: false,
                remoteVersion: freshETag,
              };
            }
          }

          if (copyId && copyName) {
            currentManifest.documents[copyId] = {
              ...meta,
              id: copyId,
              name: copyName,
              dirty: false,
              remoteVersion: copyRemoteVersion,
              isConflictCopy: true,
              conflictCopyCreatedAt: Date.now(),
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            // Place the copy in the same folder as the original
            const parentFolder = currentManifest.folders[meta.folderId] || currentManifest.folders["root"];
            if (parentFolder && !parentFolder.documents.includes(copyId)) {
              parentFolder.documents.push(copyId);
            }
          }

          await this.local.saveManifest(currentManifest);
          console.log(`[syncDocument] conflict: saved rebuilt manifest to local`);
        }

        // 5. Push final manifest to remote
        await this.syncManifestToRemote();
        console.log(`[syncDocument] conflict: pushed manifest to remote`);

        this.emit({ status: "idle" });
        console.log(`[syncDocument] → conflict (resolved keep-both)`);
        return "conflict";
      }

      // No conflict — normal push
      console.log(`[syncDocument] no conflict, normal push`);
      const data = await this.local.loadDocument(docId);
      if (!data) {
        console.log(`[syncDocument] → error: no local data for ${docId}`);
        return "error";
      }

      await this.remote.saveDocument(docId, data, meta);
      const freshRemoteVersion = await this.remote.getRemoteVersion(docId);
      console.log(`[syncDocument] pushed, freshRemoteVersion=${freshRemoteVersion}`);
      const updatedMeta: DocumentMeta = {
        ...meta,
        dirty: false,
        remoteVersion: freshRemoteVersion,
      };
      await this.local.saveDocument(docId, data, updatedMeta);
      // ALSO update the local manifest, otherwise DocumentManager
      // reads stale remoteVersion=null on next edit, triggering false conflicts.
      const manifest = await this.local.getManifest();
      if (manifest && manifest.documents[docId]) {
        manifest.documents[docId] = { ...manifest.documents[docId], ...updatedMeta };
        console.log(`[syncDocument] updated local manifest for ${docId} → remoteVersion=${freshRemoteVersion}`);
        await this.local.saveManifest(manifest);
      }
      await this.syncManifestToRemote();
      this.emit({ status: "idle" });
      console.log(`[syncDocument] → synced`);
      return "synced";
    } catch (err) {
      console.error(`[syncDocument] error:`, err);
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
    console.log(`[fullSync] START`);
    this.emit({ status: "syncing", documentId: "*" });
    try {
      const remoteManifest = await this.remote.getManifest();
      if (!remoteManifest) {
        console.log(`[fullSync] no remote manifest, nothing to pull`);
        this.emit({ status: "idle" });
        return;
      }

      console.log(
        `[fullSync] remote manifest has ${Object.keys(remoteManifest.documents).length} docs`,
      );

      // Unconditionally pull all remote documents
      for (const [docId, remoteMeta] of Object.entries(
        remoteManifest.documents,
      )) {
        console.log(
          `[fullSync] pulling doc=${docId} name="${remoteMeta.name}" deleted=${remoteMeta.deleted} remoteVersion=${remoteMeta.remoteVersion}`,
        );

        // If remote doc is soft-deleted, delete local body and let tombstone
        // propagate via manifest merge below.
        if (remoteMeta.deleted) {
          console.log(`[fullSync] doc=${docId} is tombstone, deleting local body`);
          await this.local.deleteDocument(docId);
          continue;
        }

        const remoteData = await this.remote.loadDocument(docId);
        // Re-check dirty status in real-time — it may have changed since
        // fullSync started (user could have edited a previously-clean doc).
        const freshMeta = (await this.local.listDocuments()).find(
          (d) => d.id === docId,
        );
        const isDirty = freshMeta?.dirty ?? false;
        console.log(
          `[fullSync] doc=${docId} isDirty=${isDirty} freshMeta.remoteVersion=${freshMeta?.remoteVersion}`,
        );
        if (remoteData) {
          await this.local.saveDocument(docId, remoteData, {
            ...remoteMeta,
            dirty: isDirty,
            remoteVersion: isDirty
              ? freshMeta!.remoteVersion
              : remoteMeta.remoteVersion,
          });
        }
      }

      // Merge manifests: remote is the source of truth, but preserve
      // local-only documents that aren't on remote yet.
      // Tombstones: if remote says deleted, accept the tombstone — but if
      // local is dirty, auto-create a conflict copy (user was editing a
      // doc that got deleted on another device).
      const localManifest = await this.local.getManifest();
      const merged: Manifest = {
        folders: { ...remoteManifest.folders },
        documents: { ...remoteManifest.documents },
      };
      if (localManifest) {
        for (const [id, m] of Object.entries(localManifest.documents)) {
          if (!merged.documents[id]) {
            // Doc only exists locally — keep it
            console.log(`[fullSync] merge: adding local-only doc ${id}`);
            merged.documents[id] = m;
          } else if (merged.documents[id].deleted && m.dirty) {
            // Remote deleted but local has dirty changes → conflict copy
            console.log(
              `[fullSync] merge: local doc ${id} is dirty but remote deleted it — creating conflict copy`,
            );
            const copyId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const copyMeta: DocumentMeta = {
              ...m,
              id: copyId,
              name: `${m.name} - Copy`,
              dirty: false,
              remoteVersion: null,
              isConflictCopy: true,
              conflictCopyCreatedAt: Date.now(),
              deleted: false,
            };
            // Place copy in the same folder
            const parentFolder = merged.folders[m.folderId] || merged.folders["root"];
            if (parentFolder && !parentFolder.documents.includes(copyId)) {
              parentFolder.documents.push(copyId);
            }
            merged.documents[copyId] = copyMeta;
            // Keep the remote tombstone
          } else if (m.dirty && !merged.documents[id].deleted) {
            console.log(
              `[fullSync] merge: preserving dirty doc ${id}, localRemoteVersion=${m.remoteVersion}`,
            );
            merged.documents[id] = m;
          }
          // else: remote version wins (including tombstones for clean local docs)
        }
        for (const [id, f] of Object.entries(localManifest.folders)) {
          if (!merged.folders[id]) {
            merged.folders[id] = f;
          }
        }
      }
      await this.local.saveManifest(merged);
      console.log(
        `[fullSync] merged manifest saved, ${Object.keys(merged.documents).length} docs`,
      );

      this.emit({ status: "idle" });
      console.log(`[fullSync] DONE`);
    } catch (err) {
      console.error(`[fullSync] error:`, err);
      this.emit({
        status: "error",
        message: err instanceof Error ? err.message : "Full sync failed",
      });
    }
  }

  public async syncManifestToRemote(): Promise<void> {
    const manifest = await this.local.getManifest();
    if (manifest) {
      console.log(
        `[syncManifestToRemote] pushing manifest with ${Object.keys(manifest.documents).length} docs`,
      );
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

  /**
   * Force-sync: clear all local data, then pull everything from remote.
   * This is a nuclear option — all unsynced local changes will be lost.
   * Intended for manual use via dev console, not exposed in the UI.
   */
  /**
   * Check if remote has a newer version of targetDoc. If stale, pull the
   * remote version into local storage and return true. Return false if
   * local is up-to-date (or doc doesn't exist remotely).
   * Used before opening a document — minimizes edit conflicts.
   */
  async pullIfStale(targetDocId: string): Promise<boolean> {
    console.log(`[pullIfStale] checking doc=${targetDocId}`);
    try {
      const remoteVersion = await this.remote.getRemoteVersion(targetDocId);
      if (!remoteVersion) {
        console.log(`[pullIfStale] doc=${targetDocId} not on remote, skip`);
        return false;
      }

      const localDocs = await this.local.listDocuments();
      const localMeta = localDocs.find((d) => d.id === targetDocId);
      if (!localMeta) {
        console.log(`[pullIfStale] doc=${targetDocId} not local, skip`);
        return false;
      }

      if (localMeta.remoteVersion === remoteVersion) {
        console.log(`[pullIfStale] doc=${targetDocId} versions match, skip`);
        return false;
      }

      if (localMeta.dirty) {
        console.log(`[pullIfStale] doc=${targetDocId} local is dirty, skip — will handle on push`);
        return false;
      }

      console.log(
        `[pullIfStale] doc=${targetDocId} STALE local=${localMeta.remoteVersion} remote=${remoteVersion}, pulling...`,
      );
      const remoteData = await this.remote.loadDocument(targetDocId);
      if (remoteData) {
        await this.local.saveDocument(targetDocId, remoteData, {
          ...localMeta,
          dirty: false,
          remoteVersion,
        });
        console.log(`[pullIfStale] doc=${targetDocId} pulled successfully`);
        return true;
      }
      return false;
    } catch (err) {
      console.warn(`[pullIfStale] error for ${targetDocId}:`, err);
      return false;
    }
  }

  async forceSync(): Promise<void> {
    this.emit({ status: "syncing", documentId: "*" });
    try {
      // 1. Clear all local data
      if (this.local.clearAll) {
        await this.local.clearAll();
      }

      // 2. Pull remote manifest
      const remoteManifest = await this.remote.getManifest();
      if (!remoteManifest) {
        this.emit({ status: "idle" });
        return;
      }

      // 3. Save remote manifest locally
      await this.local.saveManifest(remoteManifest);

      // 4. Pull every document from remote
      let count = 0;
      for (const [docId, remoteMeta] of Object.entries(
        remoteManifest.documents,
      )) {
        const remoteData = await this.remote.loadDocument(docId);
        if (remoteData) {
          await this.local.saveDocument(docId, remoteData, {
            ...remoteMeta,
            dirty: false,
          });
          count++;
        }
      }

      console.log(
        `[forceSync] Pulled ${count} documents from remote storage.`,
      );
      this.emit({ status: "idle" });
    } catch (err) {
      console.error("[forceSync] Failed:", err);
      this.emit({
        status: "error",
        message: err instanceof Error ? err.message : "Force sync failed",
      });
    }
  }
}
