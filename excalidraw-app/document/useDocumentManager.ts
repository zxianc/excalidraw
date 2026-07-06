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
      console.log("[useDocumentManager] configStr from localStorage:", configStr ? `found (${configStr.substring(0, 80)}...)` : "NOT FOUND");
      if (configStr) {
        try {
          const config: SyncConfig = JSON.parse(configStr);
          if (config.type === "s3") {
            // Skip setup if critical S3 fields are missing
            if (!config.bucket || !config.accessKey || !config.secretKey) {
              console.warn("[useDocumentManager] S3 config incomplete, skipping sync engine. Clearing invalid config.");
              localStorage.removeItem(DOC_CONSTANTS.SYNC_CONFIG_KEY);
            } else {
            console.log("[useDocumentManager] S3 config found, setting up sync engine");
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
            // Expose clearAll to wipe all local data and reload
            (window as any).__excalidraw_clearAll = async () => {
              await localAdapter.clearAll();
              window.location.reload();
            };
            // Do a full sync on startup to pull remote changes
            console.log("[useDocumentManager] running initial fullSync...");
            engine.fullSync().then(async () => {
              await mgr.reloadManifest();
              const refreshed = mgr.getManifest();
              console.log(
                `[useDocumentManager] initial fullSync done, manifest has ${Object.keys(refreshed.documents).length} docs`,
              );
              setManifest(refreshed);
            }).catch((err) => {
              console.error("[useDocumentManager] initial fullSync failed:", err);
            });
            } // end of valid config block
          }
        } catch (e) {
          console.error("[useDocumentManager] config parse error:", e);
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
      // Push manifest to remote so new doc entry is discoverable
      syncEngineRef.current?.syncManifestToRemote?.();
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
      // Push manifest so other devices see the deletion
      syncEngineRef.current?.syncManifestToRemote?.()?.catch(() => {});
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
      // Rename only changes manifest metadata, not document content.
      // Push the manifest so other devices see the name on their next fullSync.
      syncEngineRef.current?.syncManifestToRemote?.()?.catch(() => {});
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
      // Push manifest so other devices see the duplicate
      syncEngineRef.current?.syncManifestToRemote?.()?.catch(() => {});
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
      // Push manifest so other devices see the moved document
      syncEngineRef.current?.syncManifestToRemote?.()?.catch(() => {});
    },
    [manager, refreshManifest],
  );
  const switchDocument = useCallback(
    async (id: string): Promise<DocumentData | null> => {
      if (!manager) {
        return null;
      }
      console.log(`[switchDocument] switching to doc ${id}`);
      manager.setActiveDocument(id);
      const data = await manager.loadDocumentData(id);
      console.log(`[switchDocument] loaded doc ${id}: elements=${data?.elements?.length ?? 0}`);
      return data;
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
      // Push manifest so other devices see the new folder
      syncEngineRef.current?.syncManifestToRemote?.()?.catch(() => {});
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
      // Push manifest so other devices see the renamed folder on their next fullSync
      syncEngineRef.current?.syncManifestToRemote?.()?.catch(() => {});
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
      // Push manifest so other devices see the deletion
      syncEngineRef.current?.syncManifestToRemote?.()?.catch(() => {});
    },
    [manager, refreshManifest],
  );

  // Expose sync engine for switch-triggered document push
  const syncToRemote = useCallback(
    async (docId: string): Promise<SyncResult> => {
      console.log(`[useDocumentManager.syncToRemote] docId=${docId}`);
      if (!syncEngineRef.current) {
        console.log(`[useDocumentManager.syncToRemote] no sync engine`);
        return "error";
      }
      const result = await syncEngineRef.current.syncDocument(docId);
      console.log(`[useDocumentManager.syncToRemote] result=${result}`);
      return result;
    },
    [],
  );

  // Check if target document is stale before opening — pull remote if newer
  const pullIfStale = useCallback(
    async (docId: string): Promise<boolean> => {
      if (!syncEngineRef.current) {
        return false;
      }
      return await syncEngineRef.current.pullIfStale(docId);
    },
    [],
  );

  // Full sync all dirty docs + merge manifests
  const syncAll = useCallback(() => {
    console.log(`[useDocumentManager.syncAll] START`);
    syncEngineRef.current?.fullSync()?.then(async () => {
      if (manager) {
        await manager.reloadManifest();
        const refreshed = manager.getManifest();
        console.log(
          `[useDocumentManager.syncAll] done, manifest has ${Object.keys(refreshed.documents).length} docs`,
        );
        setManifest(refreshed);
      }
    }).catch((err) => {
      console.error(`[useDocumentManager.syncAll] error:`, err);
    });
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
    pullIfStale,
    syncEngineRef,
    setManifest,
    getManager: () => manager,
  };
}
