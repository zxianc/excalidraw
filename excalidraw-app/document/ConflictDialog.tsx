import { useCallback } from "react";
import type { ConflictInfo, ConflictChoice } from "./types";
import "./ConflictDialog.scss";

interface ConflictDialogProps { conflict: ConflictInfo; onResolve: (choice: ConflictChoice) => void; onClose: () => void }
const formatDate = (ts: number) => new Date(ts).toLocaleString();

export const ConflictDialog: React.FC<ConflictDialogProps> = ({ conflict, onResolve, onClose }) => {
  const handleBackdropClick = useCallback((e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); }, [onClose]);
  return (
    <div className="conflict-dialog__backdrop" onClick={handleBackdropClick}>
      <div className="conflict-dialog">
        <div className="conflict-dialog__header">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01M4.93 19h14.14a2 2 0 0 0 1.74-3L13.74 4a2 2 0 0 0-3.48 0L3.19 16a2 2 0 0 0 1.74 3z"/></svg>
          <h3>Sync Conflict Detected</h3>
        </div>
        <div className="conflict-dialog__body">
          <p>The document <strong>{conflict.documentName}</strong> has been modified on another device.</p>
          <div className="conflict-dialog__versions">
            <div className="conflict-dialog__version"><div className="conflict-dialog__version-label">Local Version</div><div className="conflict-dialog__version-info">v{conflict.localVersion} — {formatDate(conflict.localUpdatedAt)}</div></div>
            <div className="conflict-dialog__version-vs">vs</div>
            <div className="conflict-dialog__version"><div className="conflict-dialog__version-label">Remote Version</div><div className="conflict-dialog__version-info">{conflict.remoteVersion} — {formatDate(conflict.remoteUpdatedAt)}</div></div>
          </div>
          <p className="conflict-dialog__hint">Choose how to resolve this conflict:</p>
        </div>
        <div className="conflict-dialog__actions">
          <button className="conflict-dialog__btn conflict-dialog__btn--primary" onClick={() => onResolve("keep-local")}><svg viewBox="0 0 16 16" width="16" height="16"><path fill="none" stroke="currentColor" strokeWidth="1.5" d="M13 3L6 13l-3-4"/></svg>Keep Local<small>Overwrite remote with your changes</small></button>
          <button className="conflict-dialog__btn" onClick={() => onResolve("use-remote")}><svg viewBox="0 0 16 16" width="16" height="16"><path fill="none" stroke="currentColor" strokeWidth="1.5" d="M2 8l4-5v3h8v4H6v3z"/></svg>Use Remote<small>Discard local changes, use remote version</small></button>
          <button className="conflict-dialog__btn" onClick={() => onResolve("keep-both")}><svg viewBox="0 0 16 16" width="16" height="16"><path fill="none" stroke="currentColor" strokeWidth="1.5" d="M4 4h8v8H4zM8 4V1M8 15v-3M4 8H1M15 8h-3"/></svg>Keep Both<small>Save local as copy, load remote version</small></button>
        </div>
      </div>
    </div>
  );
};
