/**
 * A sidebar: a column of sections on the page's muted surface, each heading
 * a row of the size ladder whose chevron turns as it opens, its links rows
 * beneath, the current page's tinted as a chosen row is. Its links open on
 * the accordion's grid row, with no measured height. Collapsed, the column
 * shrinks to nothing on the slow tier (a whole column moving is the
 * largest thing it animates, as Fluid Functionalism's) and its toggle stays.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { SidebarSlots } from '../sidebar.js'
import {
  component,
  focusRing,
  ref,
  rowOnLadder,
  transition,
  travelled,
  unfilledHover,
} from './design.js'

const open = '[data-state="open"]'
const collapsed = '[data-collapsed="true"]'

export const Sidebar = Style.recipeFor(SidebarSlots)({
  base: {
    root: component(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        gap: ladder('gap'),
        padding: ref.space['2xs'],
        background: ref.surface.muted,
        borderInlineEnd: `${ref.border.thin} solid ${ref.outline.subtle}`,
      }),
    ),
    // A square with three lines, drawn in CSS: the sidebar's own handle.
    toggle: component(
      Style.self({
        alignSelf: 'flex-start',
        inlineSize: ladder('height'),
        blockSize: ladder('height'),
        padding: '0',
        border: '0',
        borderRadius: ref.radius.md,
        background: `linear-gradient(currentColor 0 0) center calc(50% - 5px) / 14px 1.5px no-repeat, linear-gradient(currentColor 0 0) center / 14px 1.5px no-repeat, linear-gradient(currentColor 0 0) center calc(50% + 5px) / 14px 1.5px no-repeat`,
        color: ref.text.muted,
        cursor: 'pointer',
        ...transition('background-color, color'),
      }),
      Style.pseudo(':hover', { backgroundColor: unfilledHover, color: ref.text.overt }),
      focusRing,
    ),
    nav: component(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        gap: ref.space['3xs'],
        inlineSize: '15rem',
        overflow: 'hidden',
        transitionProperty: 'inline-size, opacity',
        transitionDuration: `${travelled(ref.motion.slow)}, ${ref.motion.slow}`,
        transitionTimingFunction: ref.motion.spring,
      }),
      Style.pseudo(collapsed, { inlineSize: '0', opacity: '0' }),
    ),
    section: component(
      Style.self({
        display: 'grid',
        gridTemplateRows: 'auto 0fr',
        transitionProperty: 'grid-template-rows',
        transitionDuration: travelled(ref.motion['fast-exit']),
        transitionTimingFunction: ref.motion['ease-exit'],
      }),
      Style.pseudo(open, {
        gridTemplateRows: 'auto 1fr',
        transitionDuration: travelled(ref.motion.fast),
        transitionTimingFunction: ref.motion.ease,
      }),
    ),
    trigger: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...rowOnLadder,
        border: '0',
        borderRadius: ref.radius.md,
        background: 'transparent',
        color: ref.text.muted,
        font: 'inherit',
        ...role('caption'),
        fontWeight: ref.weight.medium,
        textAlign: 'start',
        cursor: 'pointer',
        ...transition('background-color, color'),
      }),
      Style.pseudo(':hover', { background: unfilledHover, color: ref.text.overt }),
      focusRing,
    ),
    chevron: component(
      Style.self({
        inlineSize: '0.4em',
        blockSize: '0.4em',
        borderInlineEnd: `${ref.border.thick} solid currentColor`,
        borderBlockEnd: `${ref.border.thick} solid currentColor`,
        rotate: '-45deg',
        transitionProperty: 'rotate',
        transitionDuration: travelled(ref.motion.fast),
        transitionTimingFunction: ref.motion.settle,
      }),
      Style.nest(`:where(${open}) > &`, { rotate: '45deg' }),
    ),
    // The one grid row, opened on the section's `0fr` to `1fr`, clipped here.
    links: component(
      Style.self({
        minBlockSize: '0',
        margin: '0',
        padding: '0',
        listStyle: 'none',
        overflow: 'hidden',
      }),
    ),
    item: component(Style.self({})),
    link: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        ...rowOnLadder,
        borderRadius: ref.radius.md,
        color: ref.text.default,
        textDecoration: 'none',
        ...transition('background-color, color'),
      }),
      Style.pseudo(':hover', { background: unfilledHover, color: ref.text.overt }),
      Style.pseudo('[aria-current="page"]', {
        background: ref.accent.subtle,
        color: ref.accent.ink,
        fontWeight: ref.weight.medium,
      }),
      focusRing,
    ),
  },
})
