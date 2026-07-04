import "./SyncStatus.scss";

import type { SyncState } from "./types";

interface SyncStatusProps {
  state: SyncState;
}

export const SyncStatus: React.FC<SyncStatusProps> = ({ state }) => {
  switch (state.status) {
    case "idle":
      return (
        <div className="sync-status sync-status--idle">
          <span className="sync-status__dot sync-status__dot--green" />
          <span className="sync-status__text">Synced</span>
        </div>
      );
    case "syncing":
      return (
        <div className="sync-status sync-status--syncing">
          <span className="sync-status__dot sync-status__dot--yellow sync-status__dot--pulse" />
          <span className="sync-status__text">Syncing...</span>
        </div>
      );
    case "error":
      return (
        <div className="sync-status sync-status--error" title={state.message}>
          <span className="sync-status__dot sync-status__dot--red" />
          <span className="sync-status__text">Sync Error</span>
        </div>
      );
    case "offline":
      return (
        <div className="sync-status sync-status--offline">
          <span className="sync-status__dot sync-status__dot--gray" />
          <span className="sync-status__text">Offline</span>
        </div>
      );
    case "conflict":
      return (
        <div className="sync-status sync-status--conflict">
          <span className="sync-status__dot sync-status__dot--yellow" />
          <span className="sync-status__text">Conflict</span>
        </div>
      );
  }
};
