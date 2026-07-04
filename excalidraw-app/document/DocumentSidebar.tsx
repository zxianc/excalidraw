import { useCallback, useRef, useState } from "react";
import clsx from "clsx";

import { FolderTree } from "./FolderTree";
import { SyncStatus } from "./SyncStatus";

import "./DocumentSidebar.scss";

import type { Manifest, SyncState } from "./types";

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
  const handleMenuAction = useCallback(
    (action: string) => {
      if (!contextMenu) {
        return;
      }
      const { type, id } = contextMenu;
      switch (action) {
        case "rename":
          if (type === "document") {
            onRenameDocument(id);
          } else {
            onRenameFolder(id);
          }
          break;
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
      <button
        className="doc-sidebar__toggle"
        onClick={onToggle}
        title={isOpen ? "Hide Explorer (Ctrl+B)" : "Show Explorer (Ctrl+B)"}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
      </button>
      <div className={clsx("doc-sidebar", { "doc-sidebar--open": isOpen })}>
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
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  d="M8 2v12M2 8h12"
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
        <FolderTree
          manifest={manifest}
          activeDocId={activeDocId}
          onDocumentClick={onDocumentClick}
          onDocumentContextMenu={handleDocumentContextMenu}
          onFolderContextMenu={handleFolderContextMenu}
        />
        <div className="doc-sidebar__footer">
          <SyncStatus state={syncState} />
        </div>
      </div>
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
