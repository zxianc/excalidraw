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
    if (!localMeta.dirty) {
      return false;
    }
    // If remote doesn't exist, no conflict — just push local
    if (currentRemoteVersion === null) {
      return false;
    }
    // If local has never synced, no conflict — just push local
    if (localMeta.remoteVersion === null) {
      return false;
    }
    return localMeta.remoteVersion !== currentRemoteVersion;
  }

  static buildConflictInfo(
    localMeta: DocumentMeta,
    remoteVersion: string,
    remoteUpdatedAt: number,
  ): ConflictInfo {
    return {
      documentId: localMeta.id,
      documentName: localMeta.name,
      localVersion: localMeta.version,
      remoteVersion,
      localUpdatedAt: localMeta.updatedAt,
      remoteUpdatedAt,
    };
  }

  static resolveKeepBoth(meta: DocumentMeta): string {
    const date = new Date().toISOString().slice(0, 10);
    return `${meta.name} - Copy ${date}`;
  }
}
