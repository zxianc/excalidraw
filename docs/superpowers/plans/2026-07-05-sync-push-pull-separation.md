# Sync Push/Pull Separation & Auto Conflict Resolution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate push (document-switch only) from pull (fullSync only), auto-resolve conflicts by keeping both versions, add visual indicators for conflict copies.

**Architecture:** Push becomes single-responsibility (switch doc → push current doc only). Pull becomes single-responsibility (fullSync → fetch remote data into IndexedDB, no push). Conflict detected during switch-push → auto-create copy with amber highlight + banner.

**Tech Stack:** TypeScript, React, cos-js-sdk-v5, IndexedDB, Jotai

---

### Task 1: Extend DocumentMeta with conflict tracking fields

**Files:**
- Modify: `excalidraw-app/document/types.ts:5-16`

- [ ] **Step 1: Add conflict fields to DocumentMeta**

```typescript
export interface DocumentMeta {
  id: string;
  name: string;
  folderId: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  remoteVersion: string | null;
  dirty: boolean;
  /** True when this document was auto-created by conflict resolution */
  isConflictCopy?: boolean;
  /** Timestamp when the conflict copy was created (banner + highlight fade after 24h) */
  conflictCopyCreatedAt?: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add excalidraw-app/document/types.ts
git commit -m "feat: add isConflictCopy and conflictCopyCreatedAt to DocumentMeta"
```

---

### Task 2: Convert fullSync to pull-only (remove push dirty docs loop)

**Files:**
- Modify: `excalidraw-app/sync/SyncEngine.ts:157-210`

- [ ] **Step 1: Replace fullSync body with pull-only logic**

The current `fullSync` starts with `mergeManifests()` then pushes dirty docs then pulls. Replace the entire method body:

```typescript
async fullSync(): Promise<void> {
  this.emit({ status: "syncing", documentId: "*" });
  try {
    // 1. Pull remote manifest and compare with local
    const remoteManifest = await this.remote.getManifest();
    if (remoteManifest) {
      const localDocs = await this.local.listDocuments();
      // Build the current manifest data (localAdapter may have a fresher manifest than DocumentManager memory)
      const localManifest = await this.local.getManifest();
      const localMap = new Map(
        localDocs.map((d) => [d.id, d] as const),
      );

      // 2. Pull docs where remote version is newer or doc is missing locally
      for (const [docId, remoteMeta] of Object.entries(
        remoteManifest.documents,
      )) {
        const localMeta = localMap.get(docId);
        const needsPull =
          !localMeta ||
          (remoteMeta.version &&
            (!localMeta.version || remoteMeta.version > localMeta.version));
        if (needsPull) {
          const remoteData = await this.remote.loadDocument(docId);
          if (remoteData) {
            await this.local.saveDocument(docId, remoteData, {
              ...remoteMeta,
              dirty: false,
            });
          }
        }
      }

      // 3. Merge manifests into a single latest view, persist to local
      const merged: Manifest = {
        version: Math.max(
          (localManifest?.version ?? 0),
          remoteManifest.version,
        ) + 1,
        folders: { ...remoteManifest.folders },
        documents: { ...remoteManifest.documents },
      };
      if (localManifest) {
        for (const [id, m] of Object.entries(localManifest.documents)) {
          if (!merged.documents[id]) {
            merged.documents[id] = m;
          }
        }
        for (const [id, f] of Object.entries(localManifest.folders)) {
          if (!merged.folders[id]) {
            merged.folders[id] = f;
          }
        }
      }
      await this.local.saveManifest(merged);
    }
    this.emit({ status: "idle" });
  } catch (err) {
    this.emit({
      status: "error",
      message: err instanceof Error ? err.message : "Full sync failed",
    });
  }
}
```

- [ ] **Step 2: Remove mergeManifests from fullSync and have it call the inline merge above instead**

The `mergeManifests` method on SyncEngine is no longer called by fullSync. It remains available for external callers but the inline merge in fullSync uses the pull-only logic directly.

- [ ] **Step 3: Commit**

```bash
git add excalidraw-app/sync/SyncEngine.ts
git commit -m "feat: convert fullSync to pull-only, remove push dirty docs loop"
```

---

### Task 3: Add ConflictBanner component + state atom

**Files:**
- Create: `excalidraw-app/document/ConflictBanner.tsx`
- Create: `excalidraw-app/document/ConflictBanner.scss`

- [ ] **Step 1: Create ConflictBanner component**

```typescript
import { useEffect, useState } from "react";
import "./ConflictBanner.scss";

export interface ConflictBannerInfo {
  documentName: string;
  copyName: string;
}

interface ConflictBannerProps {
  info: ConflictBannerInfo | null;
  onDismiss: () => void;
}

export const ConflictBanner: React.FC<ConflictBannerProps> = ({
  info,
  onDismiss,
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (info) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 300); // wait for fade-out transition
      }, 6000);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [info, onDismiss]);

  if (!info && !visible) {
    return null;
  }

  return (
    <div
      className={`conflict-banner ${visible && info ? "conflict-banner--visible" : "conflict-banner--hidden"}`}
    >
      <svg
        className="conflict-banner__icon"
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M8 1v10M8 13v1" />
      </svg>
      <span className="conflict-banner__text">
        <strong>{info?.copyName ?? ""}</strong>
        {" "}saved as a copy — another device updated the original.
      </span>
    </div>
  );
};
```

- [ ] **Step 2: Create ConflictBanner SCSS**

```scss
.conflict-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #fef3c7;
  border-top: 1px solid #f59e0b;
  color: #92400e;
  font-size: 12px;
  line-height: 1.4;
  flex-shrink: 0;
  transition: opacity 0.3s ease, max-height 0.3s ease;
  max-height: 60px;
  opacity: 1;

  &--hidden {
    opacity: 0;
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    border-top-width: 0;
  }

  &__icon {
    flex-shrink: 0;
    color: #f59e0b;
  }

  &__text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add excalidraw-app/document/ConflictBanner.tsx excalidraw-app/document/ConflictBanner.scss
git commit -m "feat: add ConflictBanner component for auto-resolve notifications"
```

---

### Task 4: Auto-resolve conflicts in syncDocument (keep-both, push copy to COS)

**Files:**
- Modify: `excalidraw-app/sync/SyncEngine.ts:36-72`

- [ ] **Step 1: Replace conflict-return path with auto-keep-both in syncDocument**

The current `syncDocument` returns `"conflict"` when detected. Replace with automatic keep-both:

```typescript
async syncDocument(docId: string): Promise<SyncResult> {
  const localDocs = await this.local.listDocuments();
  const meta = localDocs.find((d) => d.id === docId);
  if (!meta) {
    return "error";
  }
  if (!meta.dirty) {
    return "skipped";
  }

  this.emit({ status: "syncing", documentId: docId });

  try {
    const remoteVersion = await this.remote.getRemoteVersion(docId);
    if (ConflictResolver.hasConflict(meta, remoteVersion)) {
      // Auto-resolve: keep remote as original, save local as copy
      const localData = await this.local.loadDocument(docId);
      const remoteData = await this.remote.loadDocument(docId);

      if (remoteData && localData) {
        // 1. Overwrite local document with remote version
        await this.local.saveDocument(docId, remoteData, {
          ...meta,
          dirty: false,
          remoteVersion,
        });

        // 2. Create local copy from the local version
        const copyName = ConflictResolver.resolveKeepBoth(meta);
        const copyId = `doc-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        const copyMeta: DocumentMeta = {
          ...meta,
          id: copyId,
          name: copyName,
          dirty: false,
          remoteVersion: null,
          isConflictCopy: true,
          conflictCopyCreatedAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await this.local.saveDocument(copyId, localData, copyMeta);

        // 3. Push copy to remote (so other devices see it)
        await this.remote.saveDocument(copyId, localData, copyMeta);
      } else if (localData) {
        // Remote doesn't exist — just push local
        await this.remote.saveDocument(docId, localData, meta);
        const freshETag = await this.remote.getRemoteVersion(docId);
        await this.local.saveDocument(docId, localData, {
          ...meta,
          dirty: false,
          remoteVersion: freshETag,
        });
      }

      // 4. Sync manifest to remote so copy appears in directory tree
      await this.syncManifestToRemote();
      this.emit({ status: "idle" });
      return "conflict"; // return conflict so caller can show banner
    }

    // No conflict — normal push
    const data = await this.local.loadDocument(docId);
    if (!data) {
      return "error";
    }

    await this.remote.saveDocument(docId, data, meta);
    const freshRemoteVersion = await this.remote.getRemoteVersion(docId);
    const updatedMeta: DocumentMeta = {
      ...meta,
      dirty: false,
      remoteVersion: freshRemoteVersion,
    };
    await this.local.saveDocument(docId, data, updatedMeta);
    await this.syncManifestToRemote();
    this.emit({ status: "idle" });
    return "synced";
  } catch (err) {
    this.emit({
      status: "error",
      message: err instanceof Error ? err.message : "Sync failed",
    });
    return "error";
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add excalidraw-app/sync/SyncEngine.ts
git commit -m "feat: auto-resolve conflicts with keep-both in syncDocument"
```

---

### Task 5: Wire syncDocument result in document switch + show conflict banner

**Files:**
- Modify: `excalidraw-app/document/useDocumentManager.ts:204-206`
- Modify: `excalidraw-app/App.tsx:871-918`
- Modify: `excalidraw-app/App.tsx:1050-1080` (DocumentSidebar render)
- Modify: `excalidraw-app/document/DocumentSidebar.tsx`

- [ ] **Step 1: Change syncToRemote to return result and add conflict banner state atom to useDocumentManager**

Add a conflict banner atom and modify `syncToRemote` to return `SyncResult`:

```typescript
// Add after existing atoms in useDocumentManager.ts
export const conflictBannerAtom = atom<ConflictBannerInfo | null>(null);
```

Change `syncToRemote`:

```typescript
// Expose sync engine for switch-triggered push
const syncToRemote = useCallback(
  async (docId: string): Promise<SyncResult> => {
    if (!syncEngineRef.current) {
      return "error";
    }
    return syncEngineRef.current.syncDocument(docId);
  },
  [],
);
```

Import `ConflictBannerInfo` at top:
```typescript
import type { ConflictBannerInfo } from "./ConflictBanner";
```

And add `setConflictBanner` via Jotai in the return:
```typescript
const [, setConflictBanner] = useAtom(conflictBannerAtom);
```

Return it:
```typescript
return {
  // ... existing ...
  setConflictBanner,
};
```

- [ ] **Step 2: Modify handleDocumentSwitch in App.tsx to await syncDocument result and trigger banner**

Replace the document switch block. After the save + commitSwitch + updateScene, add:

```typescript
const handleDocumentSwitch = useCallback(
  async (docId: string) => {
    // Save current document data before switching
    if (activeDocId && excalidrawAPI) {
      const pendingTimer = docSaveTimers.current.get(activeDocId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        docSaveTimers.current.delete(activeDocId);
      }
      try {
        const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();
        await saveDocumentData(
          activeDocId,
          { elements: elements as any, appState: appState as any, files: files as any },
          { skipRefresh: true },
        );
        // Push current doc to remote (switch-triggered push — the only push path)
        const result = await syncToRemote(activeDocId);
        if (result === "conflict") {
          // Conflict was auto-resolved with keep-both. Refresh manifest so the
          // copy appears in the tree, and show the conflict banner.
          if (manager) {
            await manager.reloadManifest();
            setManifest(manager.getManifest());
          }
          const mgr = getManager();
          if (mgr) {
            const meta = mgr.getManifest().documents[activeDocId];
            if (meta) {
              setConflictBanner({
                documentName: meta.name,
                copyName: meta.name.includes(" - Copy") ? meta.name : `${meta.name} - Copy`,
              });
            }
          }
        }
      } catch {
        // silently ignore
      }
    }

    // Commit React state FIRST so render happens before we fill the canvas
    const mgr = getManager();
    if (mgr) {
      commitSwitch(docId, mgr);
    }
    const data = await switchDocument(docId);
    if (data && excalidrawAPI) {
      excalidrawAPI.updateScene({
        elements: data.elements as any,
        appState: data.appState as any,
      });
      if (Object.keys(data.files).length > 0) {
        excalidrawAPI.addFiles(Object.values(data.files));
      }
    }
  },
  [
    switchDocument,
    commitSwitch,
    excalidrawAPI,
    activeDocId,
    saveDocumentData,
    syncToRemote,
    getManager,
    setConflictBanner,
    manager,
    setManifest,
  ],
);
```

- [ ] **Step 3: Add ConflictBanner to DocumentSidebar render in App.tsx**

Add state and pass to DocumentSidebar. In ExcalidrawWrapper:

```typescript
const [conflictBannerInfo, setConflictBannerInfo] = useAtom(conflictBannerAtom);
```

Destructure from useDocumentManager:
```typescript
setConflictBanner: setConflictBannerInfo,
```

Add banner prop to DocumentSidebar:
```tsx
<DocumentSidebar
  // ... existing props ...
  conflictBannerInfo={conflictBannerInfo}
  onDismissConflictBanner={() => setConflictBannerInfo(null)}
/>
```

- [ ] **Step 4: Add ConflictBanner to DocumentSidebar component**

Modify `excalidraw-app/document/DocumentSidebar.tsx`:

Add imports:
```typescript
import { ConflictBanner } from "./ConflictBanner";
import type { ConflictBannerInfo } from "./ConflictBanner";
```

Add props:
```typescript
interface DocumentSidebarProps {
  // ... existing props ...
  conflictBannerInfo: ConflictBannerInfo | null;
  onDismissConflictBanner: () => void;
}
```

Add banner between FolderTree and footer:
```tsx
<FolderTree ... />
<ConflictBanner
  info={conflictBannerInfo}
  onDismiss={onDismissConflictBanner}
/>
<div className="doc-sidebar__footer">
```

- [ ] **Step 5: Commit**

```bash
git add excalidraw-app/document/useDocumentManager.ts excalidraw-app/App.tsx excalidraw-app/document/DocumentSidebar.tsx
git commit -m "feat: wire syncDocument result in switch + show conflict banner"
```

---

### Task 6: Add conflict copy amber highlight in FolderTree

**Files:**
- Modify: `excalidraw-app/document/FolderTree.tsx:94-124`
- Modify: `excalidraw-app/document/FolderTree.scss:82-84`

- [ ] **Step 1: Add conflict-copy CSS class logic to document item**

```tsx
<div
  className={clsx("folder-tree__doc", {
    "folder-tree__doc--active": isActive,
    "folder-tree__doc--editing": isEditing,
    "folder-tree__doc--conflict-copy": doc.isConflictCopy &&
      !isConflictCopyExpired(doc),
  })}
  onClick={isEditing ? undefined : onClick}
  onContextMenu={onContextMenu}
  title={isEditing
    ? undefined
    : doc.isConflictCopy
      ? `${doc.name} — auto-saved from device conflict`
      : doc.name
  }
>
```

Add the helper before the component:

```typescript
const CONFLICT_HIGHLIGHT_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function isConflictCopyExpired(doc: DocumentMeta): boolean {
  if (!doc.conflictCopyCreatedAt) {
    return true;
  }
  return Date.now() - doc.conflictCopyCreatedAt > CONFLICT_HIGHLIGHT_DURATION;
}
```

- [ ] **Step 2: Add SCSS for conflict copy row**

Add after `&--active` block in `excalidraw-app/document/FolderTree.scss`:

```scss
  &--conflict-copy {
    background: rgba(245, 158, 11, 0.08);
    &:hover {
      background: rgba(245, 158, 11, 0.14);
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add excalidraw-app/document/FolderTree.tsx excalidraw-app/document/FolderTree.scss
git commit -m "feat: add amber highlight for conflict copy documents in tree"
```

---

### Task 7: Add beforeunload handler to push current doc on page close

**Files:**
- Modify: `excalidraw-app/App.tsx`

- [ ] **Step 1: Add beforeunload effect in ExcalidrawWrapper**

Add this useEffect after existing effects (around line 745):

```typescript
// Push current document to remote when the page is about to close
// (closes the "last-document blind spot" of switch-triggered push)
useEffect(() => {
  const handleBeforeUnload = () => {
    if (activeDocId && syncEngineRef?.current) {
      // Use sendBeacon-like approach: syncDocument will push to COS
      // navigator.sendBeacon is not practical for this, so we fire-and-forget
      syncEngineRef.current.syncDocument(activeDocId).catch(() => {});
    }
  };

  window.addEventListener("beforeunload", handleBeforeUnload);
  return () => window.removeEventListener("beforeunload", handleBeforeUnload);
}, [activeDocId]);
```

Note: This needs `syncEngineRef` exposed from `useDocumentManager`. Add to the return:

```typescript
// In useDocumentManager return:
syncEngineRef,
```

And in App.tsx destructure:
```typescript
const {
  // ... existing ...
  syncEngineRef,
} = useDocumentManager();
```

- [ ] **Step 2: Commit**

```bash
git add excalidraw-app/document/useDocumentManager.ts excalidraw-app/App.tsx
git commit -m "feat: add beforeunload handler to push current doc on page close"
```

---

### Task 8: Push empty document data to COS on creation

**Files:**
- Modify: `excalidraw-app/document/useDocumentManager.ts:74-86`

- [ ] **Step 1: Push new document data (not just manifest) to COS on creation**

Replace the `syncManifestToRemote` call in `createDocument`:

```typescript
const createDocument = useCallback(
  async (name?: string, parentFolderId?: string) => {
    if (!manager) {
      return null;
    }
    const doc = manager.createDocumentSync(name, parentFolderId);
    refreshManifest();
    await manager.finalizeCreateDocument(doc);
    // Push empty document data + manifest to COS so other devices
    // can pull the .excalidraw file (not just manifest entry)
    const data = await manager.loadDocumentData(doc.id);
    if (data && syncEngineRef.current) {
      try {
        await syncEngineRef.current.syncDocument(doc.id);
      } catch {
        // syncDocument expects dirty flag; new doc is dirty=false initially.
        // Fall back to explicit remote save + manifest sync.
        const remote = (syncEngineRef.current as any).remote;
        if (remote) {
          await remote.saveDocument(doc.id, data, doc);
        }
      }
    }
    syncEngineRef.current?.syncManifestToRemote?.()?.catch(() => {});
    return doc;
  },
  [manager, refreshManifest],
);
```

Wait — new documents have `dirty: false` and `syncDocument` skips non-dirty docs. We need a different approach. Instead, in `DocumentManager.createDocumentSync`, mark the doc as dirty when it's a new creation so the push path works:

```typescript
// In DocumentManager.createDocumentSync, change:
dirty: true, // was false — mark dirty so switch-time push works
```

This is simpler and uses the existing push path (user creates doc → edits → switches away → gets pushed). For the immediate push on creation, we just call `syncManifestToRemote` which is what the current code does. The key fix is marking the doc dirty so the switch-push path actually pushes it.

Actually — rethinking: the user creates a doc, sees an empty canvas, may close the browser without editing. If dirty=true, the next startup tries to push it but it conflicts with nothing. Let me keep dirty=false but make the create flow explicitly push empty doc + manifest.

Simplest approach:

- [ ] **Step 1: Modify createDocumentSync in DocumentManager to mark new doc dirty**

Actually simplest: just set `dirty: true` in `createDocumentSync`. The empty document gets pushed on next switch (or beforeunload). If the user never switches and closes, beforeunload pushes it. If they create and immediately switch, it gets pushed. This is clean and uses existing infra.

```typescript
// In excalidraw-app/document/DocumentManager.ts:89
dirty: true, // was false
```

- [ ] **Step 2: Commit**

```bash
git add excalidraw-app/document/DocumentManager.ts
git commit -m "fix: mark new documents dirty so switch-push includes them"
```

---

### Self-Review

**1. Spec coverage:**
- ✅ fullSync pull-only (Task 2)
- ✅ switch-triggered push only (Task 5 wires syncDocument into handleDocumentSwitch)
- ✅ conflict auto-resolve keep-both (Task 4)
- ✅ conflict copy pushed to COS (Task 4)
- ✅ beforeunload handler (Task 7)
- ✅ new doc data pushed to COS (Task 8)
- ✅ conflict banner at sidebar bottom (Task 3 + 5)
- ✅ amber highlight on conflict copies (Task 6)

**2. Placeholder scan:** No TBD, TODO, or vague instructions. All code is concrete.

**3. Type consistency:**
- `isConflictCopy` used in Task 1 (define) and Task 6 (render)
- `conflictCopyCreatedAt` used in Task 1 (define), Task 4 (set), and Task 6 (expiry check)
- `ConflictBannerInfo` used in Task 3 (define), Task 5 (atom + component)
- `syncEngineRef` exposed in Task 7, accessed in App.tsx


---

## 2026-07-05 Bug Fixes (Completed)

### Fix 1: New documents create infinite conflict copies
**Root cause:** `createDocumentSync` marked new docs as `dirty: true`. In `useDocumentManager.createDocument`, `syncManifestToRemote()` returns `undefined`, so `??` always fell through to `fullSync()`. Combined with `dirty: true`, every switch triggered a conflict → copy → push → loop.

**Fix:**
- `DocumentManager.ts:89`: `dirty: true` → `dirty: false` (new empty docs shouldn't trigger sync)
- `useDocumentManager.ts:112`: Removed `?? fullSync()` fallback — only `syncManifestToRemote` on create

### Fix 2: Post-sync state drift between META_STORE and MANIFEST_STORE
**Root cause:** `LocalAdapter` has two separate stores: `META_STORE` (per-doc metadata with `remoteVersion`) and `MANIFEST_STORE` (folder tree + doc list). `syncDocument`'s normal-push path only updated `META_STORE` via `saveDocument`, but never updated `MANIFEST_STORE`. `reloadManifest()` reads from `MANIFEST_STORE` → got stale `remoteVersion: null` → next edit wrote stale version → false conflict.

**Fix:** In `SyncEngine.ts` normal-push path (after `saveDocument`), also read `local.getManifest()`, update the doc entry with `updatedMeta`, and call `local.saveManifest()`.

### Fix 3: App.tsx always reload manifest after sync (not just on conflict)
**Root cause:** `handleDocumentSwitch` only called `reloadManifest()` inside the `if (result === "conflict")` block. After a successful sync, DocumentManager's in-memory manifest was stale (mismatched with IDB stores). Next save overwrote correct `remoteVersion`.

**Fix:** Moved `reloadManifest()` to run unconditionally after every `syncToRemote` call.

### Fix 4: DocumentManager.saveDocumentData no longer pushes stale manifest
**Root cause:** `saveDocumentData` called `persistManifest()` on every save, writing the in-memory manifest (with stale `remoteVersion`) to IDB, overwriting the correct data `syncDocument` had just written.

**Fix:** Removed the `persistManifest()` call from `saveDocumentData`. Only `syncDocument` and `reloadManifest` should write manifests.

### Fix 5: Conflict copies re-trigger conflicts on switch
**Root cause:** When `syncDocument` creates a conflict copy, the copy was pushed to COS with `remoteVersion: null` in both `META_STORE` and `MANIFEST_STORE`. Switching away from the copy → `syncDocument` saw `remoteVersion: null` + remote exists → false conflict → new copy.

**Fix:** After pushing the copy, retrieve its ETag and save it back to both stores, so the copy's `remoteVersion` matches the remote state.


---

## 2026-07-06 Bug Fixes (Completed)

### Fix 6: Conflict copy placed in wrong folder + copyVersion reference error
**Root cause:** Conflict copies were hardcoded to root folder. Also `copyETag` was declared with `const` inside an `if (localData)` block, unreachable from the manifest rebuild section below — `ReferenceError: copyETag is not defined`.

**Fix:**
- `SyncEngine.ts`: Copy placed in same folder as original (`meta.folderId`), fallback to root.
- `SyncEngine.ts`: `copyRemoteVersion` declared at outer scope with `let`, assigned via `remote.getRemoteVersion(copyId)`.

### Fix 7: Conflict copies always re-trigger conflict on switch (copyVersion = null)
**Root cause:** `saveDocument` returned `void`, so the copy's ETag was never captured. `getRemoteVersion(copyId)` was called to fetch it, but that method depends on the remote manifest — which hadn't been pushed yet (chicken-and-egg). Result: copy's `remoteVersion` always stayed `null` → next switch detected conflict → infinite copy chain.

**Fix:**
- `StorageAdapter.saveDocument` interface returns `string | null` (CO S returns ETag, LocalAdapter returns null).
- `S3Adapter.saveDocument` returns `putObject` ETag directly.
- `SyncEngine.ts` conflict handler uses `saveDocument` return value directly.

### Fix 8: Metadata-only operations (rename, move, delete, create folder) overwrote local changes
**Root cause:** Six hooks (`renameDocument`, `renameFolder`, `moveDocument`, `deleteDocument`, `createFolder`, `deleteFolder`, `duplicateDocument`) were calling `fullSync()` after making local changes — pulling remote data over the local changes before they were pushed. Renames and moves were immediately clobbered.

**Fix:** All six hooks switched from `fullSync()` to `syncManifestToRemote()` — push-only for metadata changes. Full sync is for pulling, not pushing.
