# Multi-Document Workspace Design Spec

**Date:** 2026-07-04
**Scope:** excalidraw-app (application layer)
**Status:** Draft

## Overview

Transform Excalidraw from a single-document editor into a multi-document workspace with a VSCode-style sidebar, folder-based document organization, S3-compatible cloud sync, and offline-first architecture.

## Problem Statement

Excalidraw currently uses a single-document storage model (localStorage/IndexedDB stores one set of elements + appState). Users who need to work on multiple drawings must export/import to switch between them. There is no built-in way to:

- Manage multiple documents in one session
- Switch between documents without losing work
- Sync documents across devices without paying for Excalidraw+

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | `excalidraw-app/` layer | Keeps core library untouched; fast iteration |
| Architecture | Hybrid (app-layer with extractable modules) | Core modules designed with clean interfaces for future extraction to `packages/` |
| Layout | VSCode-style file tree sidebar | Familiar UX, persistent navigation, collapsible |
| Organization | Folders | Hierarchical structure for growing document collections |
| Storage | S3-compatible (Phase 1), WebDAV (Phase 2) | S3 is the de facto standard; covers OSS, COS, R2, MinIO |
| Config sharing | Export/import encrypted string + QR code | No backend needed; easy multi-device setup |
| Conflict strategy | Detect + user choice (keep local / use remote / keep both) | Safe, no data loss, user in control |
| Offline | Offline-first with IndexedDB | Never lose work due to network issues |
| Deployment | Static hosting (Vercel/CF Pages) + S3 bucket | No backend server needed |

## Architecture

### Module Structure

```
excalidraw-app/
├── document/
│   ├── DocumentManager.ts        # Document CRUD, folder tree, active document
│   ├── DocumentSidebar.tsx       # Sidebar UI component
│   ├── FolderTree.tsx            # Tree view with drag-and-drop
│   ├── ConflictDialog.tsx        # Conflict resolution modal
│   ├── SyncStatus.tsx            # Sync indicator (green/yellow/red dot)
│   ├── types.ts                  # DocumentMeta, FolderNode, etc.
│   └── useDocumentManager.ts     # React hook
├── storage/
│   ├── StorageAdapter.ts         # Interface (abstract)
│   ├── LocalAdapter.ts           # IndexedDB implementation
│   ├── S3Adapter.ts              # S3-compatible implementation
│   └── WebDAVAdapter.ts          # Phase 2
├── sync/
│   ├── SyncEngine.ts             # Orchestrates local <-> remote sync
│   ├── ConflictResolver.ts       # Version comparison + conflict detection
│   └── ConfigCrypto.ts           # Encrypt/decrypt config for export/import
└── components/
    └── SettingsDialog.tsx        # S3 config form + import/export
```

### Key Interfaces

```typescript
// storage/StorageAdapter.ts
interface StorageAdapter {
  listDocuments(): Promise<DocumentMeta[]>;
  loadDocument(id: string): Promise<DocumentData>;
  saveDocument(id: string, data: DocumentData): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  getManifest(): Promise<Manifest>;
  saveManifest(manifest: Manifest): Promise<void>;
  getRemoteVersion(docId: string): Promise<string | null>; // ETag or version
}

// document/types.ts
interface DocumentMeta {
  id: string;
  name: string;
  folderId: string;       // "root" for top-level
  createdAt: number;
  updatedAt: number;
  remoteVersion: string | null;
  dirty: boolean;         // unsaved local changes
  thumbnail?: string;     // base64 data URL (Phase 2)
}

interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  children: string[];     // folder IDs
  documents: string[];    // document IDs
}

interface Manifest {
  version: number;
  folders: Record<string, FolderNode>;
  documents: Record<string, DocumentMeta>;
}

interface DocumentData {
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
}

interface SyncConfig {
  type: "s3" | "webdav"; // extensible
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region?: string;
  pathPrefix?: string;   // subfolder in bucket
}
```

### Data Flow

**Save flow (offline-first):**

1. User edits canvas
2. `onChange` fires -> `DocumentManager.autoSave()` (debounced 500ms)
3. Write to IndexedDB immediately (always succeeds offline)
4. Mark document as `dirty`
5. `SyncEngine` picks up dirty documents (debounced 2s)
6. GET remote version (ETag/version field)
7. If no conflict: PUT local -> remote, clear dirty flag
8. If conflict: show `ConflictDialog` with three options:
   - Keep local (overwrite remote)
   - Use remote (overwrite local)
   - Keep both (save local as "Doc Name - Copy YYYY-MM-DD", load remote)

**Load flow:**

1. App starts -> load manifest from IndexedDB
2. If remote configured: fetch remote manifest, merge
3. User clicks document in sidebar -> load from IndexedDB first (fast)
4. Background: check remote version, update if newer (with conflict check)

**Switch document flow:**

1. User clicks document in sidebar
2. Save current document state to IndexedDB (if dirty)
3. Load target document from IndexedDB
4. Call `excalidrawAPI.updateScene()` with new elements/appState/files
5. Background sync check for the newly loaded document

### S3 Bucket Structure

```
my-excalidraw-bucket/
├── __manifest.json          # Folder tree + document metadata
├── __config.json            # Sync protocol version
├── root/
│   ├── doc-abc123.excalidraw
│   └── doc-def456.excalidraw
├── Project Alpha/
│   ├── doc-ghi789.excalidraw
│   └── doc-jkl012.excalidraw
└── assets/
    ├── file-xxx.png
    └── file-yyy.svg
```

Each `.excalidraw` file contains the full document JSON (elements + appState + files references). Binary assets (embedded images) stored separately in `assets/`.

### Conflict Detection

- Each document has a `version` counter (incremented on each save)
- On save: compare local version with remote version
- If remote version > last known version AND local is dirty -> conflict
- Conflict dialog shows: last modified time for both versions

### Config Export/Import

**Export:**
1. Collect SyncConfig (endpoint, bucket, AK, SK)
2. Prompt user for a password
3. Encrypt with AES-GCM via Web Crypto API
4. Encode as base64 string
5. Display as copyable text + QR code

**Import:**
1. User pastes encrypted string or scans QR code
2. Enter password to decrypt
3. Parse and validate config
4. Test connection (LIST on bucket)
5. Apply config and start initial sync

## UI Design

### Sidebar

- Position: Left side, 240px width, resizable
- Toggle: `Cmd+B` / `Ctrl+B` keyboard shortcut, hamburger icon in toolbar
- Sections:
  - Header: "Explorer" label + action buttons (new doc, new folder, refresh)
  - Folder tree: collapsible, supports drag-and-drop (Phase 2)
  - Document items: icon + name, click to switch, right-click context menu
  - Footer: sync status indicator (green/yellow/red dot + text)

### Context Menu (right-click on document)

- Rename
- Move to folder
- Duplicate
- Delete
- Export as .excalidraw
- Share link (Phase 2, pre-signed URL)

### Settings Dialog

- Tab: "Cloud Sync"
  - Storage type selector (S3 / WebDAV)
  - Connection form (endpoint, bucket, AK, SK, region)
  - Test Connection button
  - Export Config / Import Config buttons
- Tab: "Local"
  - Storage usage stats
  - Clear local cache button
  - Export all documents (batch)
  - Import documents (batch)

## Implementation Phases

### Phase 1: Core (this spec)

- [ ] DocumentManager with IndexedDB backend
- [ ] StorageAdapter interface + LocalAdapter
- [ ] S3Adapter implementation
- [ ] SyncEngine with conflict detection
- [ ] VSCode-style sidebar with folder tree
- [ ] Document CRUD (create, rename, delete, duplicate, move)
- [ ] Folder CRUD (create, rename, delete, move)
- [ ] Config export/import (encrypted string + QR code)
- [ ] Sync status indicator
- [ ] Offline-first save flow
- [ ] Keyboard shortcut (Cmd+B toggle sidebar)
- [ ] Settings dialog with S3 config

### Phase 2: Polish + WebDAV

- [ ] WebDAVAdapter implementation
- [ ] Document thumbnails (canvas snapshot on save)
- [ ] Document search (by name)
- [ ] Drag-and-drop folder reordering
- [ ] Recent documents list
- [ ] Batch import/export (.excalidraw files)
- [ ] Document sharing via pre-signed S3 URLs

### Phase 3: Advanced

- [ ] GitAdapter (GitHub/GitLab repos)
- [ ] Version history UI
- [ ] CRDT-based conflict resolution (Yjs)
- [ ] Optional: extract core modules to `packages/excalidraw-document-manager`

## Testing Strategy

- Unit tests: DocumentManager, StorageAdapter, SyncEngine, ConflictResolver, ConfigCrypto
- Integration tests: S3Adapter with mocked S3 (or local MinIO)
- Component tests: DocumentSidebar, ConflictDialog
- E2E: offline save -> reconnect -> sync flow

## Security Considerations

- AK/SK stored in IndexedDB (local), never sent to any server except the configured S3 endpoint
- Config export uses AES-GCM encryption with user-chosen password
- S3 bucket should be configured with CORS policy allowing the app origin
- Recommend users create IAM sub-accounts with bucket-scoped permissions
- No telemetry or analytics on document content

## Dependencies (new)

- `@aws-sdk/client-s3` or `aws-sdk` (S3 operations)
- `qrcode` (QR code generation for config export)
- No backend dependencies
