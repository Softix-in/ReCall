import { colors } from './colors';

describe('theme colors', () => {
  it('T1.7 matches locked IMPLEMENTATION.md tokens', () => {
    expect(colors.bg).toBe('#000000');
    expect(colors.surface).toBe('#0d0d0d');
    expect(colors.surface2).toBe('#161616');
    expect(colors.surface3).toBe('#1f1f1f');
    expect(colors.border).toBe('#2a2a2a');
    expect(colors.borderFocus).toBe('#444444');
    expect(colors.text).toBe('#ffffff');
    expect(colors.text2).toBe('#c8c8c8');
    expect(colors.muted).toBe('#6b6b6b');
    expect(colors.accent).toBe('#ffffff');
    expect(colors.accentBg).toBe('rgba(255,255,255,0.06)');
    expect(colors.success).toBe('#4ade80');
    expect(colors.danger).toBe('#f87171');
    expect(colors.warning).toBe('#fbbf24');
  });
});
