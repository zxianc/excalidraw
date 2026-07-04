import type { DocumentMeta, ConflictInfo } from "../document/types";

export class ConflictResolver {
  static hasConflict(
    localMeta: DocumentMeta,
    currentRemoteVersion: string | null,
  ): boolean {
    if (!localMeta.dirty) {
      return false;
    }
    if (currentRemoteVersion === null && localMeta.remoteVersion === null) {
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
