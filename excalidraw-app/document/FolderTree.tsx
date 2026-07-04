import { useCallback, useState } from "react";
import clsx from "clsx";

import "./FolderTree.scss";

import type { DocumentMeta, FolderNode, Manifest } from "./types";

interface FolderTreeProps {
  manifest: Manifest;
  activeDocId: string | null;
  onDocumentClick: (docId: string) => void;
  onDocumentContextMenu: (docId: string, e: React.MouseEvent) => void;
  onFolderContextMenu: (folderId: string, e: React.MouseEvent) => void;
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
    {doc.dirty && <span className="folder-tree__doc-dirty">●</span>}
  </div>
);

interface FolderItemProps {
  folder: FolderNode;
  manifest: Manifest;
  activeDocId: string | null;
  expandedFolders: Set<string>;
  toggleFolder: (id: string) => void;
  onDocumentClick: (docId: string) => void;
  onDocumentContextMenu: (docId: string, e: React.MouseEvent) => void;
  onFolderContextMenu: (folderId: string, e: React.MouseEvent) => void;
}

const FolderItem: React.FC<FolderItemProps> = ({
  folder,
  manifest,
  activeDocId,
  expandedFolders,
  toggleFolder,
  onDocumentClick,
  onDocumentContextMenu,
  onFolderContextMenu,
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
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              d="M6 4l4 4-4 4"
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
        <div
          className={clsx("folder-tree__folder-children", {
            "folder-tree__folder-children--root": isRoot,
          })}
        >
          {folder.children.map((childId) => {
            const f = manifest.folders[childId];
            if (!f) {
              return null;
            }
            return (
              <FolderItem
                key={childId}
                folder={f}
                manifest={manifest}
                activeDocId={activeDocId}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                onDocumentClick={onDocumentClick}
                onDocumentContextMenu={onDocumentContextMenu}
                onFolderContextMenu={onFolderContextMenu}
              />
            );
          })}
          {folder.documents.map((docId) => {
            const doc = manifest.documents[docId];
            if (!doc) {
              return null;
            }
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
  const rootFolder = manifest.folders.root;
  if (!rootFolder) {
    return null;
  }
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
      />
    </div>
  );
};
