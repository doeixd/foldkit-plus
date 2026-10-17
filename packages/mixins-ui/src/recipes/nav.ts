/**
 * A navigation menu: links and triggers in a row (or a column, on the list's
 * `data-orientation="vertical"`), each a rung of the size ladder, the
 * current one in the strong ink with a line under it (`indicator:
 * 'underline'`, beside it in a column) or a tinted pill behind it
 * (`indicator: 'pill'`). A trigger's chevron turns while its panel shows,
 * and the panel is a popup card of link columns, stacked where it has no
 * room for them side by side, each link's words over a muted line. Given
 * `Nav.fluid`, the line or pill glides to the current entry and a faint
 * pill follows the pointer to the nearest one; until it runs, the current
 * entry draws its own mark.
 */
import { Style } from 'foldkit-mixins'
import { NavSlots } from '../nav.js'
import {
  component,
  cornerSides,
  focusRing,
  glide,
  onLadder,
  ref,
  transition,
  unfilledHover,
  variant,
} from './design.js'
import { panel } from './popup.js'

const current = ':is([aria-current="page"], [data-current])'
const fluid = ':where([data-fluid-hover]) > &'
const column = ':where([data-orientation="vertical"])'
/** A top-level entry of a list no Mount marks, where it draws its own mark. */
const unlit = (state: string) => `:where(:not([data-fluid-hover])) > :where(li) > &${state}`
const at = (name: 'hover' | 'chosen', part: 'x' | 'y' | 'w' | 'h') =>
  `var(--fk-nav-${name}-${part})`

const overlay = (name: 'hover' | 'chosen') =>
  Style.self({
    position: 'absolute',
    // Physical: the Mounts measure from the left, in either direction.
    top: '0',
    left: '0',
    display: 'none',
    inlineSize: at(name, 'w'),
    translate: `${at(name, 'x')} ${at(name, 'y')}`,
    pointerEvents: 'none',
    listStyle: 'none',
  })

/** A top-level link or trigger. */
const entry = Style.compose(
  Style.self({
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    ...onLadder,
    border: '0',
    borderRadius: ref.radius.md,
    background: 'transparent',
    color: ref.text.muted,
    font: 'inherit',
    fontWeight: ref.weight.medium,
    textDecoration: 'none',
    cursor: 'pointer',
    ...transition('color, background-color'),
  }),
  Style.pseudo(':hover', { color: ref.text.overt }),
  Style.pseudo(current, { color: ref.text.overt }),
  // Without `fluid`, the current entry draws its own line and the hover its fill.
  Style.nest(unlit(':hover'), { background: unfilledHover }),
  Style.nest(unlit(current), {
    boxShadow: `inset 0 calc(-1 * ${ref.border.thick}) 0 ${ref.accent.default}`,
  }),
  Style.nest(`${column} > :where(li) > &`, { justifyContent: 'space-between' }),
  focusRing,
)

export const Nav = Style.recipeFor(NavSlots)({
  base: {
    nav: component(Style.self({})),
    list: component(
      Style.self({
        position: 'relative',
        isolation: 'isolate',
        display: 'flex',
        gap: ref.space['3xs'],
        margin: '0',
        padding: '0',
        listStyle: 'none',
      }),
      Style.pseudo('[data-orientation="vertical"]', {
        flexDirection: 'column',
        alignItems: 'stretch',
        inlineSize: 'fit-content',
      }),
    ),
    item: component(Style.self({ display: 'flex', flexDirection: 'column' })),
    link: component(entry),
    trigger: component(entry),
    // A chevron drawn in CSS, down under a row and up while its panel shows.
    // It never shrinks: a phone's row squeezed its box to its borders alone,
    // which the turn drew as a slanted tick.
    chevron: component(
      Style.self({
        flex: 'none',
        inlineSize: '0.4em',
        blockSize: '0.4em',
        marginBlockStart: '-0.2em',
        marginInlineStart: ref.space['3xs'],
        ...cornerSides(ref.border.thick, 'currentColor'),
        rotate: '45deg',
        transitionProperty: 'rotate',
        transitionDuration: `calc(${ref.motion.fast} * ${ref.knob.travel})`,
        transitionTimingFunction: ref.motion.settle,
      }),
      Style.nest(':where([data-state="open"]) > &', {
        rotate: '225deg',
        marginBlockStart: '0.2em',
      }),
      // In a column it points where the panel opens, open or not.
      Style.nest(`${column} > li > * > &`, { rotate: '-45deg', marginBlockStart: '0' }),
      Style.nest(`${column}:dir(rtl) > li > * > &`, { rotate: '135deg' }),
    ),
    panel: Style.compose(
      panel,
      component(
        Style.self({
          marginBlockStart: '0',
          padding: ref.space.xs,
          maxInlineSize: 'min(40rem, calc(100vw - 16px))',
        }),
      ),
    ),
    // Columns of at least 12rem side by side while the panel has room, and
    // stacked where it has not: a fixed row of columns ran past a phone's
    // edge, out of the panel the viewport holds.
    groups: component(Style.self({ display: 'flex', flexWrap: 'wrap', gap: ref.space.xs })),
    group: component(
      Style.self({
        display: 'flex',
        flex: '1 1 12rem',
        flexDirection: 'column',
        gap: ref.space['3xs'],
        minInlineSize: '0',
      }),
    ),
    heading: component(
      Style.self({
        paddingInline: ref.space.xs,
        paddingBlock: ref.space['3xs'],
        color: ref.text.muted,
        fontSize: ref.size.xs,
        fontWeight: ref.weight.medium,
      }),
    ),
    links: component(
      Style.self({ display: 'grid', gap: '0', margin: '0', padding: '0', listStyle: 'none' }),
    ),
    panelItem: component(Style.self({})),
    panelLink: component(
      Style.self({
        display: 'grid',
        gap: ref.space['3xs'],
        padding: ref.space.xs,
        borderRadius: ref.radius.md,
        color: 'inherit',
        textDecoration: 'none',
        ...transition('background-color'),
      }),
      Style.pseudo(':hover', { background: unfilledHover }),
      Style.pseudo('[aria-current="page"]', {
        background: ref.accent.subtle,
        color: ref.accent.ink,
      }),
      focusRing,
    ),
    title: component(Style.self({ fontWeight: ref.weight.medium })),
    description: component(
      Style.self({ color: ref.text.muted, fontSize: ref.size.sm, lineHeight: ref.leading.snug }),
    ),
    indicator: component(
      overlay('chosen'),
      Style.self({
        zIndex: '1',
        blockSize: ref.border.thick,
        marginBlockStart: `calc(${at('chosen', 'h')} - ${ref.border.thick})`,
        borderRadius: ref.radius.full,
        background: ref.accent.default,
        ...glide('moderate', '1'),
      }),
      // In a column, a bar along the current entry's inline start.
      Style.nest(`${column} > &`, {
        inlineSize: ref.border.thick,
        blockSize: at('chosen', 'h'),
        marginBlockStart: '0',
      }),
      Style.nest(`${column}:dir(rtl) > &`, {
        translate: `calc(${at('chosen', 'x')} + ${at('chosen', 'w')} - ${ref.border.thick}) ${at('chosen', 'y')}`,
      }),
      Style.nest(fluid, { display: 'var(--fk-nav-chosen-display, none)' }),
    ),
    highlight: component(
      overlay('hover'),
      Style.self({
        zIndex: '-1',
        blockSize: at('hover', 'h'),
        borderRadius: ref.radius.md,
        background: unfilledHover,
        opacity: 'var(--fk-nav-hover-shown)',
        ...glide('fast', 'var(--fk-nav-hover-moving)'),
      }),
      Style.nest(fluid, { display: 'block' }),
    ),
  },
  variants: {
    indicator: {
      underline: {},
      // A tinted pill behind the current entry, as a chosen pill tab's.
      pill: {
        link: variant(
          Style.pseudo(current, { color: ref.accent.ink }),
          Style.nest(unlit(current), { boxShadow: 'none', background: ref.accent.subtle }),
        ),
        trigger: variant(
          Style.pseudo(current, { color: ref.accent.ink }),
          Style.nest(unlit(current), { boxShadow: 'none', background: ref.accent.subtle }),
        ),
        indicator: variant(
          Style.self({
            zIndex: '-1',
            inlineSize: at('chosen', 'w'),
            blockSize: at('chosen', 'h'),
            marginBlockStart: '0',
            translate: `${at('chosen', 'x')} ${at('chosen', 'y')}`,
            borderRadius: ref.radius.md,
            background: ref.accent.subtle,
          }),
          Style.nest(`${column}:dir(rtl) > &`, {
            translate: `${at('chosen', 'x')} ${at('chosen', 'y')}`,
          }),
        ),
      },
    },
  },
  defaults: { indicator: 'underline' },
})
