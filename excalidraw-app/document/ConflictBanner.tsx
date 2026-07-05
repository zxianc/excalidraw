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
        setTimeout(onDismiss, 300);
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
        <strong>{info?.copyName ?? ""}</strong>{" "}
        saved as a copy — another device updated the original.
      </span>
    </div>
  );
};
