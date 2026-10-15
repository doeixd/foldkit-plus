/**
 * A navigation menu: links in a row, each a rung of the size ladder, the
 * current one in the strong ink with a line under it. Given `Nav.fluid`, the
 * line glides to the current link and a faint pill follows the pointer to
 * the nearest one; until it runs, the current link draws its own line.
 */
import { Style } from 'foldkit-mixins'
import { NavSlots } from '../nav.js'
import { component, focusRing, glide, onLadder, ref, transition, unfilledHover } from './design.js'

const current = '[aria-current="page"]'
const fluid = ':where([data-fluid-hover]) > &'
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
    ),
    item: component(Style.self({})),
    link: component(
      Style.self({
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        ...onLadder,
        borderRadius: ref.radius.md,
        color: ref.text.muted,
        fontWeight: ref.weight.medium,
        textDecoration: 'none',
        ...transition('color, background-color'),
      }),
      Style.pseudo(':hover', { color: ref.text.overt }),
      Style.pseudo(current, { color: ref.text.overt }),
      // Without `fluid`, the current link draws its own line and fill.
      Style.nest(`:where(:not([data-fluid-hover])) > :where(li) > &:hover`, {
        background: unfilledHover,
      }),
      Style.nest(`:where(:not([data-fluid-hover])) > :where(li) > &${current}`, {
        boxShadow: `inset 0 calc(-1 * ${ref.border.thick}) 0 ${ref.accent.default}`,
      }),
      focusRing,
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
})
