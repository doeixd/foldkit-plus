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
 * shows only its opener. A resizable column's width is the view's
 * `--_fk-sidebar-width`, and its handle a hit area across its edge that
 * shows an accent line under the pointer, while dragged and when focused; a
 * drag moves the column at once. Given `Sidebar.fluid`, a pill glides to the
 * current link and a hover follows the pointer; until it runs, the current
 * link fills itself. A link's `action` takes its badge's place while the
 * row is hovered or holds focus (always shown on a touch screen, beside the
 * badge); a group's sits at its heading's end. `variant` draws the column
 * flush with the page's edge (`sidebar`), lifted off it as a card
 * (`floating`), or borderless on the surface it stands on (`inset`), for a
 * page drawn as a card beside it.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role, Theme } from 'foldkit-mixins/theme'
import { SidebarSlots } from '../sidebar.js'
import {
  component,
  controlHeight,
  focusRing,
  glide,
  opensBelow,
  ref,
  rowOnLadder,
  transition,
  travelled,
  turningChevron,
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
/** A group heading with an action at its end, which keeps clear of it. */
const headed = ':where([data-action="heading"]) > &'
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
  Style.pseudo(':is(:hover, :active)', { backgroundColor: unfilledHover, color: ref.text.overt }),
  focusRing,
)

/** A phone's sidebar with a Sheet: its opener alone, with no column drawn around it. */
const bareOpener = {
  margin: '0',
  border: '0',
  borderRadius: '0',
  boxShadow: 'none',
  background: 'transparent',
}

/** The resize handle's line, an accent a pixel thicker than the column's edge. */
const edgeLine = { background: ref.accent.default }

/** A row with an action, which shows it in place of the badge under the pointer. */
const actionRow = '[data-action="row"]'
const lifted = `:where(${actionRow}:is(:hover, :focus-within))`

/** A rail's header or footer: its mark alone, centred over the icons. */
const railEnd = { inlineSize: ladder('height'), justifyContent: 'center', overflow: 'hidden' }

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
  Style.nest(`${unlit}:is(:hover, :active)`, { background: unfilledHover }),
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
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: ladder('gap'),
        // The edge's width given back on its side, so the content is centred
        // on the column with its edge: a rail's icons stood half a pixel short.
        paddingBlock: ref.space['2xs'],
        paddingInlineStart: ref.space['2xs'],
        paddingInlineEnd: `calc(${ref.space['2xs']} - ${ref.border.thin})`,
        background: ref.surface.muted,
        borderInlineEnd: `${ref.border.thin} solid ${ref.outline.subtle}`,
      }),
      Style.pseudo('[data-resizing]', { cursor: 'col-resize', userSelect: 'none' }),
      onPhone('&[data-opens-sheet]', bareOpener),
    ),
    toggle: component(handle, onPhone(besideSheet, { display: 'none' })),
    // Only on a phone, where it stands for the column.
    opener: component(handle, Style.self({ display: 'none' }), onPhone('&', { display: 'block' })),
    // Neither end widens the column: its width is the navigation's.
    header: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ladder('gap'),
        minInlineSize: '0',
        contain: 'inline-size',
      }),
      onPhone(besideSheet, { display: 'none' }),
      Style.pseudo(`:where([data-collapse="offcanvas"]) > &${collapsed}`, { display: 'none' }),
      Style.nest(`:where([data-collapse="icons"]) > &${collapsed}`, railEnd),
    ),
    footer: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ladder('gap'),
        minInlineSize: '0',
        marginBlockStart: 'auto',
        contain: 'inline-size',
      }),
      onPhone(besideSheet, { display: 'none' }),
      Style.pseudo(`:where([data-collapse="offcanvas"]) > &${collapsed}`, { display: 'none' }),
      Style.nest(`:where([data-collapse="icons"]) > &${collapsed}`, railEnd),
    ),
    nav: component(
      Style.self({
        position: 'relative',
        isolation: 'isolate',
        display: 'flex',
        flexDirection: 'column',
        gap: ref.space['3xs'],
        inlineSize: 'var(--_fk-sidebar-width, 15rem)',
        minBlockSize: '0',
        overflowX: 'hidden',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        transitionProperty: 'inline-size, opacity',
        transitionDuration: `${travelled(ref.motion.slow)}, ${ref.motion.slow}`,
        transitionTimingFunction: ref.motion.spring,
      }),
      Style.pseudo(collapsed, { inlineSize: '0', opacity: '0' }),
      Style.nest(`:where([data-collapse="icons"]) > &${collapsed}`, {
        inlineSize: ladder('height'),
        opacity: '1',
      }),
      Style.nest(':where([data-resizing]) > &', { transitionDuration: '0s' }),
      onPhone(besideSheet, { display: 'none' }),
    ),
    section: component(
      opensBelow(open),
      Style.pseudo('[data-action="heading"]', { position: 'relative' }),
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
      Style.pseudo(':is(:hover, :active)', { background: unfilledHover, color: ref.text.overt }),
      Style.nest(railed, { display: 'none' }),
      Style.nest(headed, { paddingInlineEnd: controlHeight }),
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
      Style.nest(headed, { paddingInlineEnd: controlHeight }),
    ),
    chevron: component(
      turningChevron(open, '0.4em'),
      Style.self({ marginInlineStart: 'auto' }),
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
    mark: component(
      Style.self({
        display: 'inline-flex',
        flexShrink: '0',
        alignItems: 'center',
        justifyContent: 'center',
      }),
    ),
    detail: component(
      Style.self({
        display: 'flex',
        flex: '1 1 auto',
        alignItems: 'center',
        gap: ladder('gap'),
        minInlineSize: '0',
      }),
      Style.nest(railed, { display: 'none' }),
    ),
    // A row over the branch's links, which open beneath it as a section's do.
    item: component(opensBelow(open), Style.pseudo(actionRow, { position: 'relative' })),
    link: component(
      row,
      Style.at(
        '@media (hover: none)',
        Style.nest(`:where(${actionRow}) > &`, { paddingInlineEnd: controlHeight }),
      ),
    ),
    branch: component(row),
    // Its glyph centred: an icon drawn smaller than the rung sat at its start,
    // off the middle of a rail's square row.
    icon: component(
      Style.self({
        display: 'inline-flex',
        flexShrink: '0',
        alignItems: 'center',
        justifyContent: 'center',
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
        ...transition('opacity'),
      }),
      Style.nest(railed, { display: 'none' }),
      // The action takes its place; a touch screen shows both.
      Style.at('@media (hover: hover)', Style.nest(`${lifted} &`, { opacity: '0' })),
    ),
    action: component(
      Style.self({
        position: 'absolute',
        insetBlockStart: `calc(${ref.space.xs} / 2)`,
        insetInlineEnd: `calc(${ref.space.xs} / 2)`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        inlineSize: `calc(${controlHeight} - ${ref.space.xs})`,
        blockSize: `calc(${controlHeight} - ${ref.space.xs})`,
        padding: '0',
        border: '0',
        borderRadius: ref.radius.sm,
        background: 'transparent',
        color: ref.text.muted,
        cursor: 'pointer',
        ...transition('opacity, background-color, color'),
      }),
      Style.pseudo(':is(:hover, :active)', { background: unfilledHover, color: ref.text.overt }),
      Style.at(
        '@media (hover: hover)',
        Style.nest(`:where(${actionRow}:not(:hover, :focus-within)) > &`, { opacity: '0' }),
      ),
      Style.nest(railed, { display: 'none' }),
      focusRing,
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
    // A hit area centred on the column's border, so the press need not land on its pixel.
    resize: component(
      Style.self({
        position: 'absolute',
        insetBlock: '0',
        insetInlineEnd: `calc(-1 * (${ref.space['2xs']} + ${ref.border.thin} / 2))`,
        zIndex: '1',
        inlineSize: ref.space.xs,
        cursor: 'col-resize',
        touchAction: 'none',
        // No callout of iOS's own for a press held while dragging.
        WebkitTouchCallout: 'none',
      }),
      Style.pseudo('::after', {
        content: '""',
        position: 'absolute',
        insetBlock: '0',
        insetInlineStart: '50%',
        inlineSize: ref.border.thick,
        marginInlineStart: `calc(${ref.border.thick} / -2)`,
        background: 'transparent',
        ...transition('background-color'),
      }),
      Style.pseudo(':is(:hover, :focus-visible)::after', edgeLine),
      Style.nest(':where([data-resizing]) > &::after', edgeLine),
      Style.pseudo(':focus-visible', { outline: 'none' }),
      onPhone(besideSheet, { display: 'none' }),
    ),
  },
  variants: {
    variant: {
      sidebar: {},
      // Lifted off the page's edge: a card of the muted surface, its border all round.
      floating: {
        root: variant(
          Style.self({
            margin: ref.space.xs,
            // An edge all round: the padding is even again.
            paddingInlineEnd: ref.space['2xs'],
            border: `${ref.border.thin} solid ${ref.outline.subtle}`,
            borderRadius: ref.radius.lg,
            boxShadow: ref.shadow.sm,
          }),
          // The variant's own, since it sets what the base's phone rule takes away.
          onPhone('&[data-opens-sheet]', bareOpener),
        ),
      },
      // On the surface it stands on, with no edge of its own: the page beside it is the card.
      inset: {
        root: variant(
          Style.self({
            paddingInlineEnd: ref.space['2xs'],
            background: 'transparent',
            borderInlineEnd: '0',
          }),
        ),
      },
    },
  },
  defaults: { variant: 'sidebar' },
})
