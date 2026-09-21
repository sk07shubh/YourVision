export interface ThemeTokens {
  bg: string; panel: string; elevated: string; text: string; muted: string;
  border: string; accent: string; success: string; danger: string; shadow: string;
}

const fallback: ThemeTokens = {
  bg: '#1a1a1a', panel: '#262626', elevated: '#2c2c2c', text: '#f5f5f5', muted: '#a3a3a3',
  border: '#3c3c3c', accent: '#ffa116', success: '#2cbb5d', danger: '#ef4743', shadow: 'rgba(0,0,0,.22)'
};

function useful(c: string): boolean { return Boolean(c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent'); }

export function readLeetCodeTheme(anchor?: HTMLElement | null): ThemeTokens {
  const node = anchor ?? document.body;
  const style = getComputedStyle(node);
  const body = getComputedStyle(document.body);
  const button = [...document.querySelectorAll<HTMLElement>('button')].find(b => /run/i.test(b.innerText));
  const bs = button ? getComputedStyle(button) : null;
  return {
    bg: useful(body.backgroundColor) ? body.backgroundColor : fallback.bg,
    panel: useful(style.backgroundColor) ? style.backgroundColor : fallback.panel,
    elevated: useful(bs?.backgroundColor ?? '') ? bs!.backgroundColor : fallback.elevated,
    text: useful(style.color) ? style.color : fallback.text,
    muted: 'rgb(163, 163, 163)',
    border: useful(style.borderColor) ? style.borderColor : fallback.border,
    accent: fallback.accent,
    success: fallback.success,
    danger: fallback.danger,
    shadow: fallback.shadow,
  };
}

export function themeVariables(t: ThemeTokens): string {
  return `:host{--yv-bg:${t.bg};--yv-panel:${t.panel};--yv-elevated:${t.elevated};--yv-text:${t.text};--yv-muted:${t.muted};--yv-border:${t.border};--yv-accent:${t.accent};--yv-success:${t.success};--yv-danger:${t.danger};--yv-shadow:${t.shadow};}`;
}
