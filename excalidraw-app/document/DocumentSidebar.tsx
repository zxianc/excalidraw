import { useCallback, useRef, useState } from "react";
import clsx from "clsx";

import { FolderTree } from "./FolderTree";
import { SyncStatus } from "./SyncStatus";
import { ConflictBanner } from "./ConflictBanner";
import type { ConflictBannerInfo } from "./ConflictBanner";

import "./DocumentSidebar.scss";

import type { EditingItem, Manifest, SyncState } from "./types";

interface DocumentSidebarProps {
  manifest: Manifest;
  activeDocId: string | null;
  syncState: SyncState;
  isOpen: boolean;
  onToggle: () => void;
  onDocumentClick: (docId: string) => void;
  onCreateDocument: (parentFolderId?: string) => Promise<{ id: string; name: string } | null>;
  onCreateFolder: (parentFolderId?: string) => Promise<{ id: string; name: string } | null>;
  onDeleteDocument: (docId: string) => void;
  onRenameDocument: (docId: string, name: string) => void;
  onDuplicateDocument: (docId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onOpenSettings: () => void;
  onSyncAll: () => void;
  conflictBannerInfo: ConflictBannerInfo | null;
  onDismissConflictBanner: () => void;
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
  onSyncAll,
  conflictBannerInfo,
  onDismissConflictBanner,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleDocumentContextMenu = useCallback(
    (docId: string, e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: "document",
        id: docId,
      });
    },
    [],
  );
  const handleFolderContextMenu = useCallback(
    (folderId: string, e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: "folder",
        id: folderId,
      });
    },
    [],
  );
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Commit a rename from the inline editor
  const handleRenameCommit = useCallback(
    (type: "document" | "folder", id: string, name: string) => {
      const trimmed = name.trim();
      if (trimmed) {
        if (type === "document") {
          onRenameDocument(id, trimmed);
        } else {
          onRenameFolder(id, trimmed);
        }
      }
      setEditingItem(null);
    },
    [onRenameDocument, onRenameFolder],
  );

  const handleRenameCancel = useCallback(() => {
    setEditingItem(null);
  }, []);

  // When renaming is cancelled, if the item was just created (its name
  // matches the default), keep the default name — no change needed.
  // User can rename later via context menu.

  const handleCreateDocument = useCallback(async () => {
    const doc = await onCreateDocument();
    if (doc) {
      setEditingItem({ type: "document", id: doc.id, name: doc.name });
    }
  }, [onCreateDocument]);

  const handleCreateFolder = useCallback(async () => {
    const folder = await onCreateFolder();
    if (folder) {
      setEditingItem({ type: "folder", id: folder.id, name: folder.name });
    }
  }, [onCreateFolder]);

  const handleMenuAction = useCallback(
    async (action: string) => {
      if (!contextMenu) {
        return;
      }
      const { type, id } = contextMenu;
      switch (action) {
        case "rename": {
          // Use inline editing instead of prompt
          const name =
            type === "document"
              ? manifest.documents[id]?.name ?? ""
              : manifest.folders[id]?.name ?? "";
          setEditingItem({ type, id, name });
          break;
        }
        case "delete":
          if (type === "document") {
            onDeleteDocument(id);
          } else {
            onDeleteFolder(id);
          }
          break;
        case "duplicate":
          if (type === "document") {
            onDuplicateDocument(id);
          }
          break;
        case "new-file": {
          const doc = await onCreateDocument(id);
          if (doc) {
            setEditingItem({ type: "document", id: doc.id, name: doc.name });
          }
          break;
        }
        case "new-folder": {
          const folder = await onCreateFolder(id);
          if (folder) {
            setEditingItem({ type: "folder", id: folder.id, name: folder.name });
          }
          break;
        }
      }
      closeContextMenu();
    },
    [
      contextMenu,
      manifest,
      onDeleteDocument,
      onDuplicateDocument,
      onDeleteFolder,
      onCreateDocument,
      onCreateFolder,
      closeContextMenu,
    ],
  );

  return (
    <>
      <div
        ref={sidebarRef}
        className={clsx("doc-sidebar", {
          "doc-sidebar--closed": !isOpen,
        })}
      >
        {isOpen && (
          <>
            <div className="doc-sidebar__header">
              <span className="doc-sidebar__title">EXPLORER</span>
              <div className="doc-sidebar__actions">
                <button
                  className="doc-sidebar__action-btn"
                  onClick={handleCreateDocument}
                  title="New Document"
                  aria-label="New File"
                >
                  <svg viewBox="0 0 16 16" width="16" height="16">
                    <path
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      d="M8 2v12M2 8h12"
                    />
                  </svg>
                </button>
                <button
                  className="doc-sidebar__action-btn"
                  onClick={handleCreateFolder}
                  title="New Folder"
                  aria-label="New Folder"
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
                  aria-label="Settings"
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
            <FolderTree
              manifest={manifest}
              activeDocId={activeDocId}
              onDocumentClick={onDocumentClick}
              onDocumentContextMenu={handleDocumentContextMenu}
              onFolderContextMenu={handleFolderContextMenu}
              editingItem={editingItem}
              onRenameCommit={handleRenameCommit}
              onRenameCancel={handleRenameCancel}
            />
            <ConflictBanner
              info={conflictBannerInfo}
              onDismiss={onDismissConflictBanner}
            />
            <div className="doc-sidebar__footer">
              <SyncStatus state={syncState} />
              <button
                className="doc-sidebar__sync-all-btn"
                onClick={onSyncAll}
                title="Sync all documents"
                aria-label="Sync All"
              >
                <svg
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M2 8a6 6 0 0 1 10.47-4M14 8a6 6 0 0 1-10.47 4" />
                  <polyline points="2,4 2,8 6,8" />
                  <polyline points="14,12 12,8 8,8" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      {/* toggle pill — sits on the left edge of the canvas area */}
      <button
        className={clsx("doc-sidebar-toggle", {
          "doc-sidebar-toggle--open": isOpen,
        })}
        onClick={onToggle}
        title={isOpen ? "Hide Explorer" : "Show Explorer"}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-1.5-2H5a2 2 0 0 0-2 2z" />
        </svg>
      </button>

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
                <button onClick={() => handleMenuAction("new-file")}>
                  New File
                </button>
                <button onClick={() => handleMenuAction("new-folder")}>
                  New Folder
                </button>
                <div className="doc-sidebar__context-menu-divider" />
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
