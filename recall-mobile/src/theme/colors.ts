export const colors = {
  bg: '#000000',
  surface: '#0d0d0d',
  surface2: '#161616',
  surface3: '#1f1f1f',
  border: '#2a2a2a',
  borderFocus: '#444444',
  text: '#ffffff',
  text2: '#c8c8c8',
  muted: '#6b6b6b',
  accent: '#ffffff',
  accentBg: 'rgba(255,255,255,0.06)',
  success: '#4ade80',
  danger: '#f87171',
  warning: '#fbbf24',
} as const;

export type ColorName = keyof typeof colors;
