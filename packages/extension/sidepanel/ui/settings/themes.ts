import { CORE_THEMES } from './theme-catalog-core.js';
import { EXTENDED_THEMES_A } from './theme-catalog-extended-a.js';
import { EXTENDED_THEMES_B } from './theme-catalog-extended-b.js';
import type { ThemeDefinition } from './theme-definition.js';

export type { ThemeDefinition } from './theme-definition.js';

export const THEMES: ThemeDefinition[] = [...CORE_THEMES, ...EXTENDED_THEMES_A, ...EXTENDED_THEMES_B];

export const DEFAULT_THEME_ID = 'void';

export function getThemeById(id: string): ThemeDefinition | undefined {
  return THEMES.find((t) => t.id === id);
}

export function applyTheme(id: string): void {
  const theme = getThemeById(id) || THEMES[0];
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value);
  }
}
