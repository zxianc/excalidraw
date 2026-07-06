import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";

import "./FolderTree.scss";

import type { DocumentMeta, FolderNode, Manifest } from "./types";
import type { EditingItem } from "./types";
// ---------------------------------------------------------------------------
// Conflict copy highlight — expires after 24 hours
// ---------------------------------------------------------------------------

const CONFLICT_HIGHLIGHT_DURATION = 24 * 60 * 60 * 1000;

function isConflictCopyExpired(doc: DocumentMeta): boolean {
  if (!doc.conflictCopyCreatedAt) {
    return true;
  }
  return Date.now() - doc.conflictCopyCreatedAt > CONFLICT_HIGHLIGHT_DURATION;
}


interface FolderTreeProps {
  manifest: Manifest;
  activeDocId: string | null;
  onDocumentClick: (docId: string) => void;
  onDocumentContextMenu: (docId: string, e: React.MouseEvent) => void;
  onFolderContextMenu: (folderId: string, e: React.MouseEvent) => void;
  editingItem: EditingItem | null;
  onRenameCommit: (
    type: "document" | "folder",
    id: string,
    name: string,
  ) => void;
  onRenameCancel: () => void;
}

// ---------------------------------------------------------------------------
// Inline rename input (replaces the name span)
// ---------------------------------------------------------------------------

const InlineRenameInput: React.FC<{
  initialName: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}> = ({ initialName, onCommit, onCancel }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    // Select everything except the file extension (if any)
    const dot = input.value.lastIndexOf(".");
    if (dot > 0) {
      input.setSelectionRange(0, dot);
    } else {
      input.select();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit(inputRef.current?.value ?? initialName);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      className="folder-tree__inline-input"
      defaultValue={initialName}
      onKeyDown={handleKeyDown}
      onBlur={() => onCommit(inputRef.current?.value ?? initialName)}
      onClick={(e) => e.stopPropagation()}
    />
  );
};

// ---------------------------------------------------------------------------
// Document item
// ---------------------------------------------------------------------------

const DocumentItem: React.FC<{
  doc: DocumentMeta;
  isActive: boolean;
  isEditing: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onRenameCommit: (name: string) => void;
  onRenameCancel: () => void;
}> = ({
  doc,
  isActive,
  isEditing,
  onClick,
  onContextMenu,
  onRenameCommit,
  onRenameCancel,
}) => (
  <div
    className={clsx("folder-tree__doc", {
      "folder-tree__doc--active": isActive,
      "folder-tree__doc--editing": isEditing,
      "folder-tree__doc--conflict-copy":
        doc.isConflictCopy && !isConflictCopyExpired(doc),
    })}
    onClick={isEditing ? undefined : onClick}
    onContextMenu={onContextMenu}
    title={
      isEditing
        ? undefined
        : doc.isConflictCopy && !isConflictCopyExpired(doc)
          ? `${doc.name} — auto-saved from device conflict`
          : doc.name
    }
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
    {isEditing ? (
      <InlineRenameInput
        initialName={doc.name}
        onCommit={onRenameCommit}
        onCancel={onRenameCancel}
      />
    ) : (
      <span className="folder-tree__doc-name">{doc.name}</span>
    )}
    {!isEditing && doc.isConflictCopy && !isConflictCopyExpired(doc) && (
      <span className="folder-tree__doc-conflict" title="Conflict copy — auto-saved from device conflict" />
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Folder item
// ---------------------------------------------------------------------------

interface FolderItemProps {
  folder: FolderNode;
  manifest: Manifest;
  activeDocId: string | null;
  expandedFolders: Set<string>;
  toggleFolder: (id: string) => void;
  onDocumentClick: (docId: string) => void;
  onDocumentContextMenu: (docId: string, e: React.MouseEvent) => void;
  onFolderContextMenu: (folderId: string, e: React.MouseEvent) => void;
  editingItem: EditingItem | null;
  onRenameCommit: (
    type: "document" | "folder",
    id: string,
    name: string,
  ) => void;
  onRenameCancel: () => void;
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
  editingItem,
  onRenameCommit,
  onRenameCancel,
}) => {
  const isExpanded = expandedFolders.has(folder.id);
  const isRoot = folder.id === "root";
  const isEditing =
    editingItem?.type === "folder" && editingItem.id === folder.id;

  return (
    <div className="folder-tree__folder">
      {!isRoot && (
        <div
          className={clsx("folder-tree__folder-header", {
            "folder-tree__folder-header--editing": isEditing,
          })}
          onClick={isEditing ? undefined : () => toggleFolder(folder.id)}
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
          {isEditing ? (
            <InlineRenameInput
              initialName={folder.name}
              onCommit={(name) => onRenameCommit("folder", folder.id, name)}
              onCancel={onRenameCancel}
            />
          ) : (
            <span className="folder-tree__folder-name">{folder.name}</span>
          )}
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
                editingItem={editingItem}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
              />
            );
          })}
          {folder.documents.map((docId) => {
            const doc = manifest.documents[docId];
            if (!doc) {
              return null;
            }
            const docEditing =
              editingItem?.type === "document" && editingItem.id === docId;
            return (
              <DocumentItem
                key={docId}
                doc={doc}
                isActive={docId === activeDocId}
                isEditing={docEditing}
                onClick={() => onDocumentClick(docId)}
                onContextMenu={(e) => onDocumentContextMenu(docId, e)}
                onRenameCommit={(name) =>
                  onRenameCommit("document", docId, name)
                }
                onRenameCancel={onRenameCancel}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Top-level tree
// ---------------------------------------------------------------------------

export const FolderTree: React.FC<FolderTreeProps> = ({
  manifest,
  activeDocId,
  onDocumentClick,
  onDocumentContextMenu,
  onFolderContextMenu,
  editingItem,
  onRenameCommit,
  onRenameCancel,
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
        editingItem={editingItem}
        onRenameCommit={onRenameCommit}
        onRenameCancel={onRenameCancel}
      />
    </div>
  );
};
