/**
 * Checkbox and Switch: controls whose state is `aria-checked`, which
 * `@foldkit/ui` writes, so the checked look needs no input condition. `tone`
 * is the checked fill; `size` the control's box. The check mark and the
 * switch thumb are pseudo-elements, so the view renders an empty control.
 */
import { Style } from 'foldkit-mixins'
import { CheckboxSlots } from '../checkbox.js'
import { SwitchSlots } from '../switch.js'
import {
  component,
  disabled,
  focusRing,
  self,
  token,
  tones,
  toneVar,
  transition,
  variant,
} from './design.js'

const checked = '[aria-checked="true"]'

const label = component(
  self({ color: token('text', 'default'), fontSize: token('size', 'md'), cursor: 'pointer' }),
)

const description = component(
  self({ color: token('text', 'muted'), fontSize: token('size', 'sm') }),
)

/** The control's edge length; the check mark and the thumb scale from it. */
const box = (length: string) => variant(self({ '--_fk-toggle-size': length }))

const sizes = {
  sm: box('0.875rem'),
  md: box('1rem'),
  lg: box('1.25rem'),
} as const

const edge = 'var(--_fk-toggle-size)'

export const Checkbox = Style.recipeFor(CheckboxSlots)({
  base: {
    checkbox: component(
      self({
        position: 'relative',
        display: 'inline-block',
        flexShrink: '0',
        inlineSize: edge,
        blockSize: edge,
        padding: '0',
        border: `${token('border', 'thin')} solid ${token('outline', 'overt')}`,
        borderRadius: token('radius', 'sm'),
        background: token('surface', 'base'),
        cursor: 'pointer',
        ...transition('background-color, border-color'),
      }),
      Style.pseudo(`:is(${checked}, [aria-checked="mixed"])`, {
        background: toneVar('fill'),
        borderColor: toneVar('fill'),
      }),
      // A check: two borders of a box, rotated; a dash when mixed.
      Style.pseudo(`${checked}::after`, {
        content: '""',
        position: 'absolute',
        insetBlockStart: '12%',
        insetInlineStart: '32%',
        inlineSize: '32%',
        blockSize: '56%',
        border: `solid ${toneVar('on-fill')}`,
        borderWidth: '0 2px 2px 0',
        rotate: '45deg',
      }),
      Style.pseudo('[aria-checked="mixed"]::after', {
        content: '""',
        position: 'absolute',
        inset: '45% 20%',
        background: toneVar('on-fill'),
      }),
      focusRing,
      disabled,
    ),
    label,
    description,
  },
  variants: {
    tone: {
      accent: { checkbox: tones.accent },
      neutral: { checkbox: tones.neutral },
    },
    size: { sm: { checkbox: sizes.sm }, md: { checkbox: sizes.md }, lg: { checkbox: sizes.lg } },
  },
  defaults: { tone: 'accent', size: 'md' },
})

export const Switch = Style.recipeFor(SwitchSlots)({
  base: {
    button: component(
      self({
        position: 'relative',
        display: 'inline-block',
        flexShrink: '0',
        inlineSize: `calc(${edge} * 1.8)`,
        blockSize: edge,
        padding: '0',
        border: '0',
        borderRadius: token('radius', 'full'),
        background: token('outline', 'overt'),
        cursor: 'pointer',
        ...transition('background-color'),
      }),
      Style.pseudo('::before', {
        content: '""',
        position: 'absolute',
        insetBlockStart: '2px',
        insetInlineStart: '2px',
        inlineSize: `calc(${edge} - 4px)`,
        blockSize: `calc(${edge} - 4px)`,
        borderRadius: token('radius', 'full'),
        background: token('surface', 'base'),
        transitionProperty: 'translate',
        transitionDuration: token('motion', 'fast'),
        transitionTimingFunction: token('motion', 'ease'),
      }),
      Style.pseudo(checked, { background: toneVar('fill') }),
      Style.pseudo(`${checked}::before`, { translate: `calc(${edge} * 0.8) 0` }),
      focusRing,
      disabled,
    ),
    label,
    description,
  },
  variants: {
    tone: {
      accent: { button: tones.accent },
      neutral: { button: tones.neutral },
    },
    size: { sm: { button: sizes.sm }, md: { button: sizes.md }, lg: { button: sizes.lg } },
  },
  defaults: { tone: 'accent', size: 'md' },
})
