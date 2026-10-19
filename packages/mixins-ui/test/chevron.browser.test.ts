/**
 * The marks drawn from two sides of a box point where a reader expects, in
 * either direction: a shut row's chevron along the row (right, or left right
 * to left), an open one down, a trigger's down and then up with its tip
 * kept on the words' line, a carousel's arrows outward, and a check the
 * same way round in both. Where a mark points is worked out from what the
 * browser computed: the corner its two drawn sides make, turned by its
 * rotation and mirrored by any flip above it.
 */
import { afterEach, describe, expect, test } from 'vitest'
import { Layers, Style, type StyleValue } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import {
  AccordionSlots,
  CarouselSlots,
  CascadeSelectSlots,
  ListboxSlots,
  MenuSlots,
  NavSlots,
  Recipes,
  SidebarSlots,
  StepsSlots,
  TreeViewSlots,
} from '../src/index.js'

// A palette too: a side drawn in a color the page lacks is invalid, and draws nothing.
const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const classOf = (
  slots: Readonly<Record<string, unknown>>,
  pieces: Readonly<Record<string, StyleValue>>,
  key: string,
): string => {
  const piece = pieces[key]
  if (piece === undefined) throw new Error(`no ${key} piece`)
  const one = Style.forSlots(slots as never)({ [key]: piece } as never) as {
    readonly css: string
    readonly rules: ReadonlyArray<{ readonly className: string }>
  }
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    one.css +
    // Still, so the turn is read where it ends.
    ':root{--fk-knob-motion:0}'
  document.head.append(style)
  return [...piece.classes, ...one.rules.map(rule => rule.className)].join(' ')
}

const draw = (dir: 'ltr' | 'rtl', html: string): HTMLElement => {
  const holder = document.createElement('div')
  holder.dir = dir
  holder.innerHTML = html
  document.body.append(holder)
  return holder
}

/** The corner two drawn sides make, as a screen angle: 0 is right, 90 down. */
const cornerOf = (style: CSSStyleDeclaration): number => {
  const drawn = (side: string) => parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0
  const key = ['top', 'right', 'bottom', 'left'].filter(drawn).join(' ')
  const corners: Record<string, number> = {
    'right bottom': 45,
    'bottom left': 135,
    'top left': 225,
    'top right': 315,
  }
  const corner = corners[key]
  if (corner === undefined) throw new Error(`not two adjacent sides: ${key}`)
  return corner
}

const normal = (degrees: number) => ((Math.round(degrees) % 360) + 360) % 360

/** Where a mark points on screen, its own turn and any horizontal flip above it applied. */
const pointing = (element: Element, pseudo?: '::before' | '::after'): number => {
  const style = getComputedStyle(element, pseudo)
  let angle = cornerOf(style) + (style.rotate === 'none' ? 0 : parseFloat(style.rotate))
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const scale = getComputedStyle(node).scale
    if (scale !== 'none' && parseFloat(scale) < 0) angle = 180 - angle
  }
  return normal(angle)
}

const RIGHT = 0
const DOWN = 90
const LEFT = 180
const UP = 270

describe.each([
  [
    'Accordion',
    () => classOf(AccordionSlots, Recipes.Accordion({}), 'chevron'),
    'data-state="open"',
    'data-state="closed"',
  ],
  [
    'Sidebar',
    () => classOf(SidebarSlots, Recipes.Sidebar({}), 'chevron'),
    'data-state="open"',
    'data-state="closed"',
  ],
] as const)('%s chevron', (_, chevron, open, shut) => {
  test.each([
    ['ltr', RIGHT],
    ['rtl', LEFT],
  ] as const)('in %s, points along the row shut and down open', (dir, along) => {
    const name = chevron()
    const holder = draw(
      dir,
      `<button ${shut}><span class="${name}"></span></button><button ${open}><span class="${name}"></span></button>`,
    )
    const [shutMark, openMark] = holder.querySelectorAll('span')
    expect(pointing(shutMark!)).toBe(along)
    expect(pointing(openMark!)).toBe(DOWN)
  })
  test('in a left-to-right island of a right-to-left page, points right shut and down open', () => {
    const name = chevron()
    const holder = draw(
      'rtl',
      `<div dir="ltr"><button ${shut}><span class="${name}"></span></button><button ${open}><span class="${name}"></span></button></div>`,
    )
    const [shutMark, openMark] = holder.querySelectorAll('span')
    expect(pointing(shutMark!)).toBe(RIGHT)
    expect(pointing(openMark!)).toBe(DOWN)
  })
})

// Each as its view draws it: Listbox's and Cascade Select's inside the
// trigger's value, Nav's straight in its trigger.
const inValue = (name: string, state: string) =>
  `<button aria-expanded="${state === 'open'}"><span><span class="${name}"></span></span></button>`
describe.each([
  ['Listbox', () => classOf(ListboxSlots, Recipes.Listbox({}), 'chevron'), inValue],
  [
    'Cascade Select',
    () => classOf(CascadeSelectSlots, Recipes.CascadeSelect({}), 'chevron'),
    inValue,
  ],
  [
    'Nav',
    () => classOf(NavSlots, Recipes.Nav({}), 'chevron'),
    (name: string, state: string) =>
      `<button data-state="${state}"><span class="${name}"></span></button>`,
  ],
] as const)("%s's trigger chevron", (_, chevron, trigger) => {
  test.each(['ltr', 'rtl'] as const)(
    'in %s, points down shut and up open, its tip on the line either way',
    dir => {
      const name = chevron()
      const holder = draw(dir, trigger(name, 'closed') + trigger(name, 'open'))
      for (const button of holder.querySelectorAll('button')) {
        button.style.cssText = 'display: flex; align-items: center; font-size: 20px; padding: 0'
        button.firstElementChild!.setAttribute('style', 'display: flex; align-items: center')
      }
      const [shutMark, openMark] = holder.querySelectorAll<HTMLElement>(`[class="${name}"]`)
      expect(pointing(shutMark!)).toBe(DOWN)
      expect(pointing(openMark!)).toBe(UP)
      // Its top and bottom from the middle of its trigger's line.
      const reach = (mark: HTMLElement) => {
        const line = mark.closest('button')!.getBoundingClientRect()
        const box = mark.getBoundingClientRect()
        const middle = line.top + line.height / 2
        return { above: middle - box.top, below: box.bottom - middle }
      }
      const [shut, open] = [reach(shutMark!), reach(openMark!)]
      // Shut and open mirror each other across the line, moved a fifth of
      // the text apart, so each tip lies as near the line as the other.
      expect(shut!.above).toBeCloseTo(open!.below, 1)
      expect(shut!.above - open!.above).toBeCloseTo(4, 1)
    },
  )
})

test.each([
  ['ltr', RIGHT],
  ['rtl', LEFT],
] as const)('in %s, a tree row points along the row shut and down open', (dir, along) => {
  const name = classOf(TreeViewSlots, Recipes.TreeView({}), 'chevron')
  const holder = draw(
    dir,
    `<li aria-expanded="false"><div><span class="${name}"></span></div></li>` +
      `<li aria-expanded="true"><div><span class="${name}"></span></div></li>`,
  )
  const [shutMark, openMark] = holder.querySelectorAll('span')
  expect(pointing(shutMark!)).toBe(along)
  expect(pointing(openMark!)).toBe(DOWN)
})

test('in a left-to-right island of a right-to-left page, a tree row points right', () => {
  const name = classOf(TreeViewSlots, Recipes.TreeView({}), 'chevron')
  const holder = draw(
    'rtl',
    `<div dir="ltr"><li aria-expanded="false"><div><span class="${name}"></span></div></li></div>`,
  )
  expect(pointing(holder.querySelector('span')!)).toBe(RIGHT)
})

test.each([
  ['ltr', RIGHT],
  ['rtl', LEFT],
] as const)('in %s, a submenu row points the way its submenu opens', (dir, along) => {
  const name = classOf(MenuSlots, Recipes.Menu({}), 'chevron')
  expect(pointing(draw(dir, `<span class="${name}"></span>`).firstElementChild!)).toBe(along)
})

test.each([
  ['ltr', LEFT, RIGHT],
  ['rtl', RIGHT, LEFT],
] as const)('in %s, the carousel arrows point outward', (dir, previous, next) => {
  const pieces = Recipes.Carousel({})
  const holder = draw(
    dir,
    `<button class="${classOf(CarouselSlots, pieces, 'previous')}"></button>` +
      `<button class="${classOf(CarouselSlots, pieces, 'next')}"></button>`,
  )
  const [back, forward] = holder.querySelectorAll('button')
  expect(pointing(back!, '::before')).toBe(previous)
  expect(pointing(forward!, '::before')).toBe(next)
})

test('a complete step draws the same check in either direction', () => {
  const name = classOf(StepsSlots, Recipes.Steps({}), 'marker')
  const check = (dir: 'ltr' | 'rtl') =>
    pointing(
      draw(dir, `<span data-state="complete" class="${name}"></span>`).firstElementChild!,
      '::after',
    )
  expect(check('rtl')).toBe(check('ltr'))
})

test.each([
  ['Sidebar', () => classOf(SidebarSlots, Recipes.Sidebar({}), 'chevron')],
  ['Tree View', () => classOf(TreeViewSlots, Recipes.TreeView({}), 'chevron')],
] as const)("the %s chevron is the shared one's size, four tenths of its text", (_, chevron) => {
  const holder = draw(
    'ltr',
    `<div aria-expanded="false" style="font-size: 20px"><div><span class="${chevron()}"></span></div></div>`,
  )
  const style = getComputedStyle(holder.querySelector('span')!)
  expect([style.width, style.height, style.borderRightWidth]).toEqual(['8px', '8px', '2px'])
  expect(style.transitionProperty).toBe('rotate')
})
