## 1. Foundation: Types, Constants, and Interfaces

- [x] 1.1 Create core types (DocumentMeta, FolderNode, Manifest, DocumentData, SyncConfig, ConflictInfo, SyncState) in excalidraw-app/document/types.ts
- [x] 1.2 Create document constants (IDB store names, auto-save debounce, sidebar width) in excalidraw-app/document/constants.ts
- [x] 1.3 Add new STORAGE_KEYS entries to excalidraw-app/app_constants.ts
- [x] 1.4 Create StorageAdapter interface in excalidraw-app/storage/StorageAdapter.ts
- [x] 1.5 Verify TypeScript compiles with new types

## 2. Local Storage: IndexedDB Adapter

- [x] 2.1 Implement LocalAdapter with IndexedDB (openDB, CRUD operations for documents and manifest)
- [x] 2.2 Write unit tests for LocalAdapter (save/load/delete documents and manifest)
- [ ] 2.3 Run tests to confirm LocalAdapter passes

## 3. Cloud Storage: S3 Adapter

- [x] 3.1 Implement S3Adapter with @aws-sdk/client-s3 (getManifest, saveManifest, loadDocument, saveDocument, deleteDocument, getRemoteVersion, testConnection)
- [x] 3.2 Write unit tests for S3Adapter with mocked S3Client
- [x] 3.3 Run tests to confirm S3Adapter passes

## 4. Sync Engine

- [x] 4.1 Implement ConflictResolver (version comparison, conflict detection logic)
- [x] 4.2 Implement ConfigCrypto (AES-GCM encrypt/decrypt for S3 config export/import)
- [x] 4.3 Implement SyncEngine (orchestrate local<->remote sync, dirty doc detection, conflict handling)
- [ ] 4.4 Write and run tests for ConflictResolver, ConfigCrypto, SyncEngine

## 5. Document Manager

- [x] 5.1 Implement DocumentManager class (document/folder CRUD, manifest management, active document tracking)
- [x] 5.2 Implement useDocumentManager React hook (Jotai atoms for manifest, activeDocId, syncState, sidebarOpen)
- [ ] 5.3 Write and run tests for DocumentManager

## 6. Sidebar and Folder Tree UI

- [x] 6.1 Create DocumentSidebar component (toggle, header with actions, document list, settings button)
- [x] 6.2 Create DocumentSidebar styles (SCSS: slide-over panel, themed colors, transitions)
- [x] 6.3 Create FolderTree component (recursive folder rendering, expand/collapse, context menus)
- [x] 6.4 Create FolderTree styles (SCSS: indentation, icons, hover states)

## 7. Conflict Dialog and Sync Status

- [x] 7.1 Create ConflictDialog component (modal with keep-local, use-remote, keep-both options)
- [x] 7.2 Create ConflictDialog styles (SCSS: modal overlay, action buttons)
- [x] 7.3 Create SyncStatus component (green/yellow/red indicator with text)
- [x] 7.4 Create SyncStatus styles (SCSS: compact indicator, color-coded states)

## 8. Settings Dialog

- [x] 8.1 Create SettingsDialog component (S3 config form, test connection, export/import config, tabs)
- [x] 8.2 Create SettingsDialog styles (SCSS: modal, form fields, tab navigation, action buttons)

## 9. App.tsx Integration

- [ ] 9.1 Integrate DocumentSidebar, ConflictDialog, SettingsDialog components into App.tsx
- [ ] 9.2 Wire up auto-save to IndexedDB (debounced 500ms on canvas onChange)
- [ ] 9.3 Implement document switching flow (save current, load target, updateScene)
- [x] 9.4 Add keyboard shortcut Cmd/Ctrl+B to toggle sidebar
- [ ] 9.5 Add sidebar-open CSS class to body for layout shift
- [ ] 9.6 Verify App.tsx integration works end-to-end

## 10. Install Dependencies and Final Verification

- [ ] 10.1 Install production dependencies (@aws-sdk/client-s3, qrcode) and dev dependencies (@types/qrcode, fake-indexeddb)
- [ ] 10.2 Run full typecheck (yarn test:typecheck) and fix any errors
- [ ] 10.3 Run all new tests (yarn vitest run excalidraw-app/storage excalidraw-app/sync excalidraw-app/document)
- [ ] 10.4 Run existing test suite (yarn test:update) to confirm no regressions
- [ ] 10.5 Manual E2E verification: create doc, switch docs, create folder, rename, duplicate, delete, auto-save, sidebar toggle, settings dialog, conflict dialog
- [ ] 10.6 Commit all remaining changes with consolidated commit message
