/**
 * A sidebar: a column on the page's muted surface, its header and footer
 * around a navigation of groups, each heading a row of the size ladder whose
 * chevron turns as it opens, its rows beneath with an icon, words and a
 * count, a branch's links nested under a guide line, the current page's
 * tinted as a chosen row is. Groups and branches open beneath their heading
 * (`opensBelow`), with no measured height. Collapsed, the column shrinks to
 * nothing (`data-collapse="offcanvas"`) or to a rail of icons (`"icons"`),
 * whose words stay for their names, on the slow tier (a whole column moving
 * is the largest thing it animates, as Fluid Functionalism's), and its toggle
 * stays. Below the theme's `md` breakpoint, a sidebar drawn with a Sheet
 * shows only its opener. `width: 'fill'` takes the width of what holds it,
 * a Resizable's panel. Given `Sidebar.fluid`, a pill glides to the current
 * link and a hover follows the pointer; until it runs, the current link
 * fills itself.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role, Theme } from 'foldkit-mixins/theme'
import { SidebarSlots } from '../sidebar.js'
import {
  component,
  cornerSides,
  focusRing,
  glide,
  opensBelow,
  ref,
  rowOnLadder,
  transition,
  travelled,
  unfilledHover,
  variant,
} from './design.js'

const open = '[data-state="open"]'
const collapsed = '[data-collapsed="true"]'
/** Inside a sidebar collapsed to its rail of icons. */
const railed = ':where([data-collapse="icons"][data-collapsed="true"]) &'
/** A row no fluid highlight runs over, which marks itself. */
const unlit = '&:not([data-fluid-hover] *)'
/** Below the `md` breakpoint, where a sidebar with a Sheet shows only its opener. */
const phone = `@media not all and ${Theme.tokens.breakpoint.md}`
const onPhone = (selector: string, declarations: Record<string, string>) =>
  Style.at(phone, Style.nest(selector, declarations))
/** A direct part of a sidebar drawn with a Sheet, which a phone hides. */
const besideSheet = ':where([data-opens-sheet]) > &'
const at = (name: 'hover' | 'chosen', part: 'x' | 'y' | 'w' | 'h') =>
  `var(--fk-sidebar-${name}-${part})`

/** The three-line handle drawn in CSS, the toggle's and the opener's. */
const handle = Style.compose(
  Style.self({
    alignSelf: 'flex-start',
    flexShrink: '0',
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
)

/** A row: a link or a branch, its icon, words and count in a line. */
const row = Style.compose(
  Style.self({
    display: 'flex',
    alignItems: 'center',
    ...rowOnLadder,
    inlineSize: '100%',
    boxSizing: 'border-box',
    border: '0',
    borderRadius: ref.radius.md,
    background: 'transparent',
    color: ref.text.default,
    font: 'inherit',
    textAlign: 'start',
    textDecoration: 'none',
    cursor: 'pointer',
    ...transition('background-color, color'),
  }),
  Style.nest(`${unlit}:hover`, { background: unfilledHover }),
  Style.pseudo(':hover', { color: ref.text.overt }),
  Style.pseudo('[aria-current="page"]', { color: ref.accent.ink, fontWeight: ref.weight.medium }),
  Style.nest(`${unlit}[aria-current="page"]`, { background: ref.accent.subtle }),
  // A rail's rows are their icons, square.
  Style.nest(railed, {
    justifyContent: 'center',
    inlineSize: ladder('height'),
    paddingInline: '0',
  }),
  focusRing,
)

const overlay = (name: 'hover' | 'chosen') =>
  Style.self({
    position: 'absolute',
    // Physical: the Mounts measure from the left, in either direction.
    top: '0',
    left: '0',
    zIndex: '-1',
    display: 'none',
    inlineSize: at(name, 'w'),
    blockSize: at(name, 'h'),
    translate: `${at(name, 'x')} ${at(name, 'y')}`,
    borderRadius: ref.radius.md,
    pointerEvents: 'none',
  })
const lit = ':where([data-fluid-hover]) > &'

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
    toggle: component(handle, onPhone(besideSheet, { display: 'none' })),
    // Only on a phone, where it stands for the column.
    opener: component(handle, Style.self({ display: 'none' }), onPhone('&', { display: 'block' })),
    header: component(
      Style.self({ display: 'flex', alignItems: 'center', gap: ladder('gap'), minInlineSize: '0' }),
      onPhone(besideSheet, { display: 'none' }),
      Style.pseudo(`:where([data-collapse="offcanvas"]) > &${collapsed}`, { display: 'none' }),
      Style.nest(`:where([data-collapse="icons"]) > &${collapsed}`, {
        inlineSize: ladder('height'),
        overflow: 'hidden',
      }),
    ),
    footer: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ladder('gap'),
        minInlineSize: '0',
        marginBlockStart: 'auto',
      }),
      onPhone(besideSheet, { display: 'none' }),
      Style.pseudo(`:where([data-collapse="offcanvas"]) > &${collapsed}`, { display: 'none' }),
      Style.nest(`:where([data-collapse="icons"]) > &${collapsed}`, {
        inlineSize: ladder('height'),
        overflow: 'hidden',
      }),
    ),
    nav: component(
      Style.self({
        position: 'relative',
        isolation: 'isolate',
        display: 'flex',
        flexDirection: 'column',
        gap: ref.space['3xs'],
        inlineSize: '15rem',
        minBlockSize: '0',
        overflowX: 'hidden',
        overflowY: 'auto',
        transitionProperty: 'inline-size, opacity',
        transitionDuration: `${travelled(ref.motion.slow)}, ${ref.motion.slow}`,
        transitionTimingFunction: ref.motion.spring,
      }),
      Style.pseudo(collapsed, { inlineSize: '0', opacity: '0' }),
      Style.nest(`:where([data-collapse="icons"]) > &${collapsed}`, {
        inlineSize: ladder('height'),
        opacity: '1',
      }),
      onPhone(besideSheet, { display: 'none' }),
    ),
    section: component(opensBelow(open)),
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
      Style.nest(railed, { display: 'none' }),
      focusRing,
    ),
    title: component(Style.self({ minInlineSize: '0' })),
    heading: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        ...rowOnLadder,
        color: ref.text.muted,
        ...role('caption'),
        fontWeight: ref.weight.medium,
      }),
      Style.nest(railed, { display: 'none' }),
    ),
    chevron: component(
      Style.self({
        flexShrink: '0',
        inlineSize: '0.4em',
        blockSize: '0.4em',
        marginInlineStart: 'auto',
        ...cornerSides(ref.border.thick, 'currentColor'),
        rotate: '-45deg',
        transitionProperty: 'rotate',
        transitionDuration: travelled(ref.motion.fast),
        transitionTimingFunction: ref.motion.settle,
      }),
      // Right to left, along the row is the other way; open is down either way.
      Style.nest('&:where(:dir(rtl))', { rotate: '135deg' }),
      Style.nest(`:where(${open}) > &`, { rotate: '45deg' }),
      Style.nest(railed, { display: 'none' }),
    ),
    // The one grid row, opened on the section's (or the branch's) `0fr` to `1fr`, clipped here.
    links: component(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        gap: ref.space['3xs'],
        minBlockSize: '0',
        margin: '0',
        padding: '0',
        listStyle: 'none',
        overflow: 'hidden',
      }),
      // A branch's links, under a guide line at the inline start.
      Style.pseudo('[data-nested]', {
        marginInlineStart: `calc(${ladder('row-pad')} + ${ladder('icon')} / 2)`,
        paddingInlineStart: ref.space['2xs'],
        borderInlineStart: `${ref.border.thin} solid ${ref.outline.subtle}`,
      }),
      Style.nest(`${railed}[data-nested]`, { display: 'none' }),
    ),
    // A row over the branch's links, which open beneath it as a section's do.
    item: component(opensBelow(open)),
    link: component(row),
    branch: component(row),
    icon: component(
      Style.self({
        display: 'inline-flex',
        flexShrink: '0',
        inlineSize: ladder('icon'),
        blockSize: ladder('icon'),
      }),
    ),
    label: component(
      Style.self({
        flex: '1 1 auto',
        minInlineSize: '0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }),
      // Kept for the row's name, as a reader's only: the tooltip shows it.
      Style.nest(railed, {
        position: 'absolute',
        inlineSize: '1px',
        blockSize: '1px',
        overflow: 'hidden',
        clipPath: 'inset(50%)',
        whiteSpace: 'nowrap',
      }),
    ),
    badge: component(
      Style.self({
        flexShrink: '0',
        marginInlineStart: 'auto',
        paddingInline: ref.space['2xs'],
        borderRadius: ref.radius.full,
        background: ref.state.tint,
        color: ref.text.muted,
        ...role('caption'),
        fontVariantNumeric: 'tabular-nums',
      }),
      Style.nest(railed, { display: 'none' }),
    ),
    tip: component(Style.self({ display: 'contents' })),
    indicator: component(
      overlay('chosen'),
      Style.self({ background: ref.accent.subtle, ...glide('moderate', '1') }),
      Style.nest(lit, { display: 'var(--fk-sidebar-chosen-display, none)' }),
    ),
    highlight: component(
      overlay('hover'),
      Style.self({
        background: unfilledHover,
        opacity: 'var(--fk-sidebar-hover-shown)',
        ...glide('fast', 'var(--fk-sidebar-hover-moving)'),
      }),
      Style.nest(lit, { display: 'block' }),
    ),
  },
  variants: {
    width: {
      // As wide as what holds it, a Resizable's panel: the column and its navigation fill it.
      fill: {
        root: variant(
          Style.self({ boxSizing: 'border-box', inlineSize: '100%', blockSize: '100%' }),
        ),
        nav: variant(
          Style.self({ inlineSize: 'auto' }),
          Style.pseudo(collapsed, { inlineSize: '0' }),
          Style.nest(`:where([data-collapse="icons"]) > &${collapsed}`, {
            inlineSize: ladder('height'),
          }),
        ),
      },
    },
  },
})
