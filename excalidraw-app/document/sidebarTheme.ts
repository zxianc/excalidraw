import tinycolor from "tinycolor2";

import type { CSSProperties } from "react";

export const getSidebarThemeStyle = (
  canvasBackgroundColor: string,
): CSSProperties => {
  const bg = tinycolor(canvasBackgroundColor);
  if (!bg.isValid()) {
    return {};
  }

  const isDark = bg.isDark();
  const textPrimary = isDark ? "#f0f0f5" : "#1b1b1f";
  const textSecondary = isDark ? "#a0a0b0" : "#5e5e72";
  const border = isDark
    ? tinycolor(canvasBackgroundColor).lighten(12).toHexString()
    : tinycolor(canvasBackgroundColor).darken(10).toHexString();
  const surfaceLow = isDark
    ? tinycolor(canvasBackgroundColor).lighten(8).toHexString()
    : tinycolor(canvasBackgroundColor).darken(4).toHexString();
  const surfaceMid = isDark
    ? tinycolor(canvasBackgroundColor).lighten(12).toHexString()
    : tinycolor(canvasBackgroundColor).darken(2).toHexString();
  const surfaceLowest = isDark
    ? tinycolor(canvasBackgroundColor).lighten(16).toHexString()
    : tinycolor(canvasBackgroundColor).lighten(4).toHexString();
  const hoverBg = isDark
    ? "rgba(255, 255, 255, 0.08)"
    : "rgba(0, 0, 0, 0.06)";
  const activeBg = isDark
    ? "rgba(255, 255, 255, 0.12)"
    : "rgba(0, 0, 0, 0.1)";
  const scrollbarThumb = isDark
    ? "rgba(255, 255, 255, 0.2)"
    : "rgba(0, 0, 0, 0.15)";
  const scrollbarThumbHover = isDark
    ? "rgba(255, 255, 255, 0.3)"
    : "rgba(0, 0, 0, 0.25)";

  return {
    "--sidebar-bg": canvasBackgroundColor,
    "--sidebar-border": border,
    "--sidebar-text": textPrimary,
    "--sidebar-text-secondary": textSecondary,
    "--sidebar-surface-low": surfaceLow,
    "--sidebar-surface-mid": surfaceMid,
    "--sidebar-surface-lowest": surfaceLowest,
    "--sidebar-hover-bg": hoverBg,
    "--sidebar-active-bg": activeBg,
    "--sidebar-scrollbar-thumb": scrollbarThumb,
    "--sidebar-scrollbar-thumb-hover": scrollbarThumbHover,
    "--text-primary-color": textPrimary,
    "--text-secondary-color": textSecondary,
    "--color-surface-low": surfaceLow,
    "--color-surface-mid": surfaceMid,
    "--color-surface-lowest": surfaceLowest,
    "--border-color": border,
  } as CSSProperties;
};
