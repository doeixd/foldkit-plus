// Written by `theme-data` (scripts/themeData.mjs) from the knobs and themes. Do not edit.
export const themeNames = ['shadcn', 'compact', 'soft', 'hard'] as const
export const initialTheme = 'shadcn' as const
export const themeAttribute = 'data-theme'
export const themeValues = {
  shadcn: { hue: 235, density: 1.1, radius: 0.45, text: 1.025, motion: 0.5, shadow: 100 },
  compact: { hue: 235, density: 0.85, radius: 0.3, text: 1.025, motion: 0.5, shadow: 60 },
  soft: { hue: 336, density: 1.2, radius: 1.3, text: 1.025, motion: 0.5, shadow: 100 },
  hard: { hue: 38, density: 1.1, radius: 0, text: 1.025, motion: 0, shadow: 100 },
} as const
export const tokenGroups = {
  space: [
    ['3xs', 'calc(0.125rem * var(--fk-knob-density))'],
    ['2xs', 'calc(0.25rem * var(--fk-knob-density))'],
    ['xs', 'calc(0.5rem * var(--fk-knob-density))'],
    ['sm', 'calc(0.75rem * var(--fk-knob-density))'],
    ['md', 'calc(1rem * var(--fk-knob-density))'],
    ['lg', 'calc(1.5rem * var(--fk-knob-density))'],
    ['xl', 'calc(2rem * var(--fk-knob-density))'],
    ['2xl', 'calc(3rem * var(--fk-knob-density))'],
    ['3xl', 'calc(4rem * var(--fk-knob-density))'],
  ],
  radius: [
    ['xs', 'calc(2px * var(--fk-knob-radius-factor))'],
    ['sm', 'calc(3px * var(--fk-knob-radius-factor))'],
    ['md', 'calc(6px * var(--fk-knob-radius-factor))'],
    ['lg', 'calc(8px * var(--fk-knob-radius-factor))'],
    ['xl', 'calc(12px * var(--fk-knob-radius-factor))'],
    ['full', 'calc(9999px * min(var(--fk-knob-radius-factor), 1))'],
    ['control', 'calc(var(--fk-radius-md) + var(--fk-knob-control-round, 0) * 9999px)'],
  ],
} as const
