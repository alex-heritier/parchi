export type SubagentColor = {
  name: string;
  hex: string;
  rgb: string;
};

export const SUBAGENT_COLORS: SubagentColor[] = [
  { name: 'cobalt', hex: '#5ea2ff', rgb: '94 162 255' },
  { name: 'ember', hex: '#ff6b5a', rgb: '255 107 90' },
  { name: 'gold', hex: '#f5c451', rgb: '245 196 81' },
  { name: 'mint', hex: '#4ed39a', rgb: '78 211 154' },
  { name: 'rose', hex: '#ff7ca8', rgb: '255 124 168' },
  { name: 'iris', hex: '#9a8cff', rgb: '154 140 255' },
  { name: 'cyan', hex: '#51d0e8', rgb: '81 208 232' },
  { name: 'tangerine', hex: '#ff9b54', rgb: '255 155 84' },
];

export function getSubagentColor(index = 0): SubagentColor {
  const safeIndex = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
  return SUBAGENT_COLORS[safeIndex % SUBAGENT_COLORS.length] || SUBAGENT_COLORS[0];
}

export function getSubagentColorStyle(index = 0): string {
  const color = getSubagentColor(index);
  return `--agent-accent:${color.hex};--agent-accent-rgb:${color.rgb};`;
}
