## Why

Excalidraw currently operates as a single-document editor — one canvas, one drawing at a time. Users who need to work on multiple drawings must export their work, clear the canvas, and import another file to switch between them. There is no built-in way to manage multiple documents in one session, organize them in folders, or sync collections across devices without paying for Excalidraw+ cloud services. This makes Excalidraw impractical for anyone managing more than a handful of drawings, and it puts multi-device workflows entirely out of reach for self-hosted users.

## What Changes

- Add a VSCode-style collapsible sidebar with a folder tree and document list, enabling users to create, rename, delete, duplicate, and switch between documents without leaving the editor.
- Introduce folder-based organization (hierarchical tree) for grouping related drawings.
- Implement a StorageAdapter pattern: LocalAdapter (IndexedDB) for offline-first persistence and S3Adapter for S3-compatible cloud storage (AWS S3, Cloudflare R2, MinIO, Alibaba OSS, Tencent COS, etc.).
- Build a SyncEngine that orchestrates local ↔ remote sync with conflict detection: when both local and remote have diverged, show a conflict dialog offering keep-local, use-remote, or keep-both options.
- Provide encrypted config export/import (AES-GCM + QR code) for securely sharing S3 credentials across devices without a backend server.
- Add a SyncStatus indicator (green/yellow/red) showing real-time sync state.
- Add a SettingsDialog for configuring cloud sync and managing local storage.
- Keyboard shortcut Cmd/Ctrl+B to toggle the sidebar.

## Capabilities

### New Capabilities
- `multi-document-management`: Create, rename, delete, duplicate, and switch between multiple documents within a single Excalidraw session.
- `folder-organization`: Organize documents into a hierarchical folder tree with create, rename, and delete operations.
- `cloud-sync-s3`: Bidirectional sync of documents and folder structure to S3-compatible object storage with conflict detection and resolution.
- `offline-first-storage`: Local-first document persistence via IndexedDB, ensuring no data loss when offline.
- `config-export-import`: Encrypt S3 credentials and export as a string/QR code for easy multi-device setup.

### Modified Capabilities
<!-- No existing capabilities require spec-level modifications -->

## Impact

- **New modules**: `excalidraw-app/document/` (DocumentManager, sidebar UI, types), `excalidraw-app/storage/` (StorageAdapter, LocalAdapter, S3Adapter), `excalidraw-app/sync/` (SyncEngine, ConflictResolver, ConfigCrypto), `excalidraw-app/components/SettingsDialog.tsx`
- **Modified files**: `excalidraw-app/App.tsx` (sidebar integration, auto-save, keyboard shortcuts), `excalidraw-app/app_constants.ts` (storage keys)
- **New dependencies**: `@aws-sdk/client-s3`, `qrcode`, `@types/qrcode`, `fake-indexeddb` (dev)
- **No backend server required** — static hosting + S3 bucket is the full deployment model.
- **No changes** to `packages/excalidraw/` core library.
