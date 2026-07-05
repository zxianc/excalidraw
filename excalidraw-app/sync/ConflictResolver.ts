import type { DocumentMeta, ConflictInfo } from "../document/types";

export class ConflictResolver {
  /**
   * Detect whether a real conflict exists between local and remote.
   *
   * Returns false (no conflict) when:
   *  - Document is clean (not dirty)
   *  - Both local and remote versions match
   *  - Remote file doesn't exist (deleted) — local just needs to re-upload
   */
  static hasConflict(
    localMeta: DocumentMeta,
    currentRemoteVersion: string | null,
  ): boolean {
    console.log(
      `[hasConflict] doc=${localMeta.id} name="${localMeta.name}" dirty=${localMeta.dirty} localRemoteVersion=${localMeta.remoteVersion} currentRemoteVersion=${currentRemoteVersion}`,
    );

    if (!localMeta.dirty) {
      console.log(`[hasConflict] → false (not dirty)`);
      return false;
    }
    // If remote doesn't exist, no conflict — just push local
    if (currentRemoteVersion === null) {
      console.log(`[hasConflict] → false (remote doesn't exist)`);
      return false;
    }
    // If local has never synced BUT remote has data, it IS a conflict
    if (localMeta.remoteVersion === null) {
      console.log(`[hasConflict] → true (local never synced but remote exists — conflict!)`);
      return true;
    }

    const conflict = localMeta.remoteVersion !== currentRemoteVersion;
    console.log(
      `[hasConflict] → ${conflict} (local="${localMeta.remoteVersion}" vs remote="${currentRemoteVersion}")`,
    );
    return conflict;
  }

  static buildConflictInfo(
    localMeta: DocumentMeta,
    _remoteVersion: string,
    remoteUpdatedAt: number,
  ): ConflictInfo {
    return {
      documentId: localMeta.id,
      documentName: localMeta.name,
      remoteVersion: _remoteVersion,
      localUpdatedAt: localMeta.updatedAt,
      remoteUpdatedAt,
    };
  }

  static resolveKeepBoth(meta: DocumentMeta): string {
    const date = new Date().toISOString().slice(0, 10);
    return `${meta.name} - Copy ${date}`;
  }
}
