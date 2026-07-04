## Context

Excalidraw is a monorepo with a React component library (`packages/excalidraw/`) and a web application (`excalidraw-app/`). Currently, the app stores a single document in localStorage/IndexedDB. Users who need multiple drawings must export/import files manually. There is no built-in sync, folder organization, or multi-document management.

The `excalidraw-app/` layer is the appropriate scope for this change — it keeps the core library untouched while enabling rapid iteration on app-level features. All new modules are designed with clean interfaces (StorageAdapter, DocumentManager, SyncEngine) that could later be extracted to `packages/` if needed.

## Goals / Non-Goals

**Goals:**
- Enable users to create, switch, rename, delete, and duplicate multiple documents within one session.
- Organize documents in a hierarchical folder tree, VSCode-explorer style.
- Sync documents to S3-compatible object storage with conflict detection and user-choice resolution.
- Work offline-first — all edits persist locally in IndexedDB whether or not a remote is configured.
- Allow users to share S3 config across devices via encrypted export strings without a backend server.
- Deploy as a pure static site — no server-side code required.

**Non-Goals:**
- Real-time collaboration on the same document (that is Excalidraw+ domain).
- WebDAV support (Phase 2).
- Document thumbnails, search, or drag-and-drop reordering (Phase 2).
- CRDT-based automatic conflict resolution (Phase 3).
- Extracting modules to `packages/` (Phase 3).

## Decisions

### 1. Architecture: App-layer modules with StorageAdapter abstraction
**Choice:** New modules under `excalidraw-app/document/`, `excalidraw-app/storage/`, `excalidraw-app/sync/`.
**Rationale:** Keeps changes isolated from the core library. Clean interfaces allow future extraction to `packages/excalidraw-document-manager`. The StorageAdapter pattern isolates storage backends so S3, WebDAV, and local IndexedDB all conform to the same contract.
**Alternatives considered:** Modifying `packages/excalidraw/` directly — rejected because it would couple document management to the render engine.

### 2. State Management: Jotai atoms (existing pattern)
**Choice:** Use Jotai atoms within `useDocumentManager` hook and existing app patterns.
**Rationale:** Excalidraw already uses Jotai; adding another state library would be unnecessary complexity. Atoms provide fine-grained reactivity for the sidebar, sync status, and document switching.

### 3. Local Storage: IndexedDB (not localStorage)
**Choice:** IndexedDB with object stores for documents, metadata, and manifest.
**Rationale:** Document data can be large (embedded images, many elements). localStorage has ~5MB limits and is synchronous. IndexedDB is asynchronous, supports large payloads, and is already used elsewhere in the codebase via `idb-keyval`.

### 4. Remote Storage Format: Individual .excalidraw JSON files + __manifest.json
**Choice:** Each document is a single JSON blob at `{folder}/{doc-id}.excalidraw`. The folder tree and metadata live in `__manifest.json` at the bucket root.
**Rationale:** Simple, debuggable (each file is standalone), human-readable if browsed directly on S3. The manifest provides fast listing without LIST operations on every load. Assets (embedded images) go in `assets/` subfolder.
**Alternatives considered:** Single monolithic file — rejected because it would make conflict resolution coarser and prevent independent document sync.

### 5. Conflict Detection: Version counter + ETag
**Choice:** Each DocumentMeta has a local `version` counter. On sync, compare local version with remote ETag/version field. If both have advanced since last common ancestor → conflict.
**Rationale:** Simple, no vector clocks or CRDTs needed. The user is presented with a dialog: keep-local, use-remote, or keep-both. This covers the common case (single-user, multiple devices) without complexity.
**Alternatives considered:** Last-write-wins — rejected because it silently loses data. CRDTs — rejected as Phase 3 complexity.

### 6. Config Sharing: AES-GCM encrypted string + QR code
**Choice:** Encrypt SyncConfig (endpoint, bucket, AK, SK) with a user-chosen password using Web Crypto API (AES-GCM). Export as base64 text + QR code. Import by pasting the string or scanning the QR, then entering the password.
**Rationale:** No backend needed. The password never leaves the browser. QR code makes mobile/tablet setup easy (scan from desktop, decrypt on device).

### 7. Sidebar Layout: Slide-over panel from left
**Choice:** A collapsible left sidebar (240px default) that slides over/alongside the canvas. Toggle via Cmd/Ctrl+B or an arrow button on the left edge.
**Rationale:** VSCode familiarity. The Excalidraw canvas is the primary workspace — the sidebar should not permanently consume canvas space. The slide-over pattern preserves full canvas width when collapsed.

### 8. Deployment: Static hosting + S3 bucket, no backend server
**Choice:** The Excalidraw app is a static SPA. The S3 adapter communicates directly with the S3-compatible API from the browser.
**Rationale:** Users self-host by pointing the app at their own S3 bucket. No server to maintain, no database to manage. CORS configuration on the S3 bucket enables browser-to-S3 communication.

## Risks / Trade-offs

- **Browser-to-S3 CORS:** The S3 bucket must be configured with appropriate CORS headers. Users unfamiliar with CORS may struggle. → Mitigation: Settings dialog includes a "Test Connection" button with clear error messages.
- **Concurrent editing conflicts:** If the same user edits from two devices simultaneously without syncing, conflicts are unavoidable. → Mitigation: Conflict dialog makes the choices explicit and offers "keep both" to avoid data loss.
- **Secret key in browser:** AK/SK are stored in IndexedDB, which is accessible to any script on the same origin. → Mitigation: Recommend IAM sub-accounts with bucket-scoped permissions. Use short-lived presigned URLs where possible (Phase 2).
- **Manifest as sync bottleneck:** The manifest must be read/written atomically for folder operations. → Mitigation: Folder operations are infrequent; the manifest is small (metadata only, not document content). If contention becomes an issue, move to per-folder manifests (Phase 3).
- **Large files with embedded images:** A single document could be many MB with embedded images. → Mitigation: Assets stored separately in `assets/` folder. IndexedDB handles large blobs efficiently. S3 multipart upload can be added (Phase 2).

## Open Questions

- Should the sidebar be resizable by the user? (Likely Phase 2)
- How to handle S3 bucket region auto-detection?
- Should we support S3-compatible services that do not implement the full S3 API (e.g., some MinIO configurations)?
- What is the default behavior when no S3 config is set — prompt or silently local-only?
