/**
 * The button group's join in a real browser: neighbours overlap by one
 * border, only the joining corners are squared (in a row and in a column,
 * and on the face a wrapper holds), a separated group's rule lies on the
 * seam over both borders, a focused item rises over its neighbour, and a
 * group across its container gives the field the room the buttons leave.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import {
  Button,
  ButtonGroup,
  ButtonGroupSlots,
  ButtonSlots,
  Input,
  InputSlots,
  Recipes,
} from '../src/index.js'

const L = Layers.standard
const Model = Schema.Struct({})
const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const outlined = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline' }),
)
const solid = Style.forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral' }))
const field = Style.forSlots(InputSlots)(Recipes.Input({}))
const group = Style.forSlots(ButtonGroupSlots)(Recipes.ButtonGroup({}))
const filling = Style.forSlots(ButtonGroupSlots)(Recipes.ButtonGroup({ width: 'fill' }))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const buttons = (h: HtmlBuilder<never>, labels: ReadonlyArray<string>, style = outlined) =>
  labels.map(label => Button.view({ label, style }, h))

/** A group across a box `width` wide: words, a field and a button. */
const across = (h: HtmlBuilder<never>, id: string, width: string): Html =>
  h.div(
    [h.Id(id), h.Style({ inlineSize: width })],
    [
      ButtonGroup.view(
        {
          label: 'Address',
          items: [
            'https://',
            Input.view(
              {
                id: `${id}-address`,
                style: field,
                draw: (resolved, h) => h.input([...resolved.input, h.AriaLabel('Address')]),
              },
              h,
            ),
            ...buttons(h, ['Go']),
          ],
          style: filling,
        },
        h,
      ),
    ],
  )

const view = (_: unknown, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ inlineSize: '480px' })],
    [
      h.div(
        [h.Id('row')],
        [
          ButtonGroup.view(
            { label: 'Row', items: buttons(h, ['One', 'Two', 'Three']), style: group },
            h,
          ),
        ],
      ),
      h.div(
        [h.Id('column')],
        [
          ButtonGroup.view(
            {
              label: 'Column',
              items: buttons(h, ['Up', 'Middle', 'Down']),
              orientation: 'vertical',
              style: group,
            },
            h,
          ),
        ],
      ),
      h.div(
        [h.Id('wrapped')],
        [
          ButtonGroup.view(
            {
              label: 'Wrapped',
              items: [...buttons(h, ['Save']), h.div([], buttons(h, ['More']))],
              style: group,
            },
            h,
          ),
        ],
      ),
      h.div(
        [h.Id('separated')],
        [
          ButtonGroup.view(
            {
              label: 'Separated',
              items: buttons(h, ['Copy', 'Paste'], solid),
              separated: true,
              style: group,
            },
            h,
          ),
        ],
      ),
      across(h, 'fill', '480px'),
      across(h, 'narrow', '200px'),
    ],
  )

const mount = async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) +
    [outlined, solid, field, group, filling].map(style => style.css).join('')
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'button-group'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view,
    }),
  )
  await vi.waitFor(() => expect(document.getElementById('fill')).not.toBeNull())
  return handle
}

const faces = (id: string): ReadonlyArray<HTMLElement> =>
  Array.from(document.getElementById(id)!.querySelectorAll('button'))
const box = (element: Element) => element.getBoundingClientRect()
const corners = (element: Element) => {
  const style = getComputedStyle(element)
  return [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ].map(radius => radius !== '0px')
}

const withPage = async (check: () => void | Promise<void>) => {
  const handle = await mount()
  try {
    await check()
  } finally {
    handle.dispose()
  }
}

test('a row overlaps each seam by one border and squares only the joining corners', () =>
  withPage(() => {
    const [one, two, three] = faces('row')
    expect(box(two!).left).toBe(box(one!).right - 1)
    expect(box(three!).left).toBe(box(two!).right - 1)
    expect(corners(one!)).toEqual([true, false, false, true])
    expect(corners(two!)).toEqual([false, false, false, false])
    expect(corners(three!)).toEqual([false, true, true, false])
  }))

test('a column stacks its items as wide as each other, joined top to bottom', () =>
  withPage(() => {
    const [up, middle, down] = faces('column')
    expect(box(middle!).top).toBe(box(up!).bottom - 1)
    expect(box(down!).top).toBe(box(middle!).bottom - 1)
    expect(box(up!).width).toBe(box(middle!).width)
    expect(box(down!).width).toBe(box(middle!).width)
    expect(corners(up!)).toEqual([true, true, false, false])
    expect(corners(middle!)).toEqual([false, false, false, false])
    expect(corners(down!)).toEqual([false, false, true, true])
  }))

test('a wrapper passes the corners to the face it holds', () =>
  withPage(() => {
    const [save, more] = faces('wrapped')
    expect(corners(save!)).toEqual([true, false, false, true])
    expect(corners(more!)).toEqual([false, true, true, false])
  }))

test("a separated group's rule lies on the seam, over both borders", () =>
  withPage(async () => {
    const [copy, paste] = faces('separated')
    const rule = document.getElementById('separated')!.querySelector('[aria-hidden="true"]')!
    expect(box(rule).width).toBe(1)
    expect(box(rule).left).toBe(box(paste!).left)
    expect(box(rule).right).toBe(box(copy!).right)
    expect(box(rule).height).toBe(box(copy!).height)
    const seam = box(rule)
    expect(document.elementFromPoint(seam.left + 0.5, seam.top + seam.height / 2)).toBe(rule)
    // A hovered button rises over its neighbour, and still not over the rule.
    await userEvent.hover(paste!)
    expect(document.elementFromPoint(seam.left + 0.5, seam.top + seam.height / 2)).toBe(rule)
  }))

test('a focused item rises over the neighbour that overlaps it', () =>
  withPage(() => {
    const [one, two] = faces('row')
    const seam = { x: box(one!).right - 0.5, y: box(one!).top + box(one!).height / 2 }
    expect(document.elementFromPoint(seam.x, seam.y)).toBe(two)
    one!.focus()
    expect(document.elementFromPoint(seam.x, seam.y)).toBe(one)
  }))

test('across its container, the field takes the room the words and button leave', () =>
  withPage(() => {
    const row = document.getElementById('fill')!.querySelector('[role="group"]')!
    const [text, input, go] = Array.from(row.children)
    expect(box(row).width).toBe(480)
    expect(box(go!).right).toBe(box(row).right)
    expect(box(input!).left).toBe(box(text!).right - 1)
    expect(box(input!).width).toBeGreaterThan(300)
    expect(box(text!).height).toBe(box(go!).height)
    expect(box(input!).height).toBe(box(go!).height)
    expect(getComputedStyle(text!).borderTopWidth).toBe('1px')
    expect(parseFloat(getComputedStyle(text!).paddingInlineStart)).toBeGreaterThan(0)
  }))

test('in a narrow row, the field gives way and nothing overflows', () =>
  withPage(() => {
    const row = document.getElementById('narrow')!.querySelector('[role="group"]')!
    const go = row.lastElementChild!
    expect(box(row).width).toBe(200)
    expect(box(go).right).toBe(box(row).right)
  }))
