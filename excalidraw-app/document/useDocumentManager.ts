import { useCallback, useEffect, useRef, useState } from "react";

import { atom, useAtom } from "../app-jotai";

import { LocalAdapter } from "../storage/LocalAdapter";
import { SyncEngine } from "../sync/SyncEngine";
import type { SyncResult } from "../sync/SyncEngine";
import { S3Adapter } from "../storage/S3Adapter";

import { DocumentManager } from "./DocumentManager";

import { DOC_CONSTANTS } from "./constants";

import type { Manifest, SyncConfig, SyncState, DocumentData } from "./types";
import type { ConflictBannerInfo } from "./ConflictBanner";

export const manifestAtom = atom<Manifest | null>(null);
export const activeDocIdAtom = atom<string | null>(null);
export const syncStateAtom = atom<SyncState>({ status: "idle" });
export const sidebarOpenAtom = atom<boolean>(true);
export const conflictBannerAtom = atom<ConflictBannerInfo | null>(null);

export function useDocumentManager() {
  const [manager, setManager] = useState<DocumentManager | null>(null);
  const [manifest, setManifest] = useAtom(manifestAtom);
  const [activeDocId, setActiveDocId] = useAtom(activeDocIdAtom);
  const [syncState, setSyncState] = useAtom(syncStateAtom);
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);
  const [initialized, setInitialized] = useState(false);
  const syncEngineRef = useRef<SyncEngine | null>(null);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const localAdapter = new LocalAdapter();
      const mgr = new DocumentManager(localAdapter);
      await mgr.init();
      if (cancelled) {
        return;
      }
      setManager(mgr);
      setManifest(mgr.getManifest());
      setActiveDocId(mgr.getActiveDocumentId());
      const configStr = localStorage.getItem(DOC_CONSTANTS.SYNC_CONFIG_KEY);
      if (configStr) {
        try {
          const config: SyncConfig = JSON.parse(configStr);
          if (config.type === "s3") {
            const remoteAdapter = new S3Adapter(config);
            const engine = new SyncEngine(localAdapter, remoteAdapter);
            syncEngineRef.current = engine;
            engine.onStateChange(setSyncState);
            // Expose forceSync on window for manual dev-console invocation
            (window as any).__excalidraw_forceSync = async () => {
              await engine.forceSync();
              await mgr.reloadManifest();
              setManifest(mgr.getManifest());
              window.location.reload();
            };
            // Do a full sync on startup to pull remote changes
            engine.fullSync().then(async () => {
              await mgr.reloadManifest();
              setManifest(mgr.getManifest());
            }).catch(() => {});
          }
        } catch {
          /* invalid config */
        }
      }
      setInitialized(true);
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [setManifest, setActiveDocId, setSyncState]);

  const refreshManifest = useCallback(() => {
    if (manager) {
      setManifest(manager.getManifest());
    }
  }, [manager, setManifest]);
  const createDocument = useCallback(
    async (name?: string, parentFolderId?: string) => {
      if (!manager) {
        return null;
      }
      const doc = manager.createDocumentSync(name, parentFolderId);
      refreshManifest();
      await manager.finalizeCreateDocument(doc);
      // Sync manifest to remote for new doc
      syncEngineRef.current?.syncManifestToRemote?.() ??
        syncEngineRef.current?.fullSync()?.then(() => { refreshManifest(); }).catch(() => {});
      return doc;
    },
    [manager, refreshManifest],
  );
  const deleteDocument = useCallback(
    async (id: string) => {
      if (!manager) {
        return;
      }
      await manager.deleteDocument(id);
      refreshManifest();
      if (activeDocId === id) {
        setActiveDocId(null);
      }
      syncEngineRef.current?.fullSync()?.then(() => { refreshManifest(); }).catch(() => {});
    },
    [manager, refreshManifest, activeDocId, setActiveDocId],
  );
  const renameDocument = useCallback(
    async (id: string, name: string) => {
      if (!manager) {
        return;
      }
      await manager.renameDocument(id, name);
      refreshManifest();
      syncEngineRef.current?.syncDocument(id)?.catch(() => {});
    },
    [manager, refreshManifest],
  );
  const duplicateDocument = useCallback(
    async (id: string) => {
      if (!manager) {
        return null;
      }
      const doc = await manager.duplicateDocument(id);
      refreshManifest();
      syncEngineRef.current?.fullSync()?.then(() => { refreshManifest(); }).catch(() => {});
      return doc;
    },
    [manager, refreshManifest],
  );
  const moveDocument = useCallback(
    async (docId: string, folderId: string) => {
      if (!manager) {
        return;
      }
      await manager.moveDocument(docId, folderId);
      refreshManifest();
    },
    [manager, refreshManifest],
  );
  const switchDocument = useCallback(
    async (id: string): Promise<DocumentData | null> => {
      if (!manager) {
        return null;
      }
      manager.setActiveDocument(id);
      return manager.loadDocumentData(id);
    },
    [manager],
  );

  // commitSwitch — call AFTER updateScene, batches manifest + activeDocId into one render
  const commitSwitch = useCallback(
    (id: string, mgr: DocumentManager) => {
      setActiveDocId(id);
      setManifest(mgr.getManifest());
    },
    [setActiveDocId, setManifest],
  );

  const saveDocumentData = useCallback(
    async (id: string, data: DocumentData, opts?: { skipRefresh?: boolean }) => {
      if (!manager) {
        return;
      }
      await manager.saveDocumentData(id, data);
      if (!opts?.skipRefresh) {
        refreshManifest();
      }
    },
    [manager, refreshManifest],
  );
  const createFolder = useCallback(
    async (name: string, parentId?: string) => {
      if (!manager) {
        return null;
      }
      const folder = manager.createFolderSync(name, parentId);
      refreshManifest();
      await manager.finalizeCreateFolder(folder);
      syncEngineRef.current?.fullSync()?.then(() => { refreshManifest(); }).catch(() => {});
      return folder;
    },
    [manager, refreshManifest],
  );
  const renameFolder = useCallback(
    async (id: string, name: string) => {
      if (!manager) {
        return;
      }
      await manager.renameFolder(id, name);
      refreshManifest();
      syncEngineRef.current?.fullSync()?.then(() => { refreshManifest(); }).catch(() => {});
    },
    [manager, refreshManifest],
  );
  const deleteFolder = useCallback(
    async (id: string) => {
      if (!manager) {
        return;
      }
      await manager.deleteFolder(id);
      refreshManifest();
      syncEngineRef.current?.fullSync()?.then(() => { refreshManifest(); }).catch(() => {});
    },
    [manager, refreshManifest],
  );

  // Expose sync engine for switch-triggered document push
  const syncToRemote = useCallback(
    async (docId: string): Promise<SyncResult> => {
      if (!syncEngineRef.current) {
        return "error";
      }
      return syncEngineRef.current.syncDocument(docId);
    },
    [],
  );

  // Full sync all dirty docs + merge manifests
  const syncAll = useCallback(() => {
    syncEngineRef.current?.fullSync()?.then(async () => {
      if (manager) {
        await manager.reloadManifest();
        setManifest(manager.getManifest());
      }
    }).catch(() => {});
  }, [manager, setManifest]);

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
    commitSwitch,
    createFolder,
    renameFolder,
    deleteFolder,
    syncToRemote,
    syncAll,
    syncEngineRef,
    setManifest,
    getManager: () => manager,
  };
}
