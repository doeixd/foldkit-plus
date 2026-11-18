/**
 * The Button's parts and new looks on a real page, read from layout and
 * computed style: the `xs` step, the link variant, an invalid button's
 * danger colors, a trailing drawing, a description's second line, and a
 * corner mark that follows the writing direction.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Button, ButtonSlots, Recipes } from '../src/index.js'
import { unitKnobs } from './fixture.js'

const theme = Theme.standard(Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 } }))
const Model = Schema.Struct({})
const styleOf = (selection: Parameters<typeof Recipes.Button>[0]) =>
  Style.forSlots(ButtonSlots)(Recipes.Button(selection))
const sizes = (['xs', 'sm', 'md', 'lg'] as const).map(size => styleOf({ size }))
const link = styleOf({ variant: 'link' })
const outline = styleOf({ tone: 'neutral', variant: 'outline' })
const plain = styleOf({})
const every = [...sizes, link, outline, plain]

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const dot = (h: HtmlBuilder<never>): Html =>
  h.span([h.Style({ inlineSize: '8px', blockSize: '8px' })], [])

const view = (_: unknown, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ padding: '40px' })],
    [
      ...(['xs', 'sm', 'md', 'lg'] as const).map((size, index) =>
        h.div([h.Id(`size-${size}`)], [Button.view({ label: 'Save', style: sizes[index]! }, h)]),
      ),
      h.div([h.Id('link')], [Button.view({ label: 'Learn more', style: link }, h)]),
      h.div([h.Id('fine')], [Button.view({ label: 'Pick', style: outline }, h)]),
      h.div([h.Id('invalid')], [Button.view({ label: 'Pick', invalid: true, style: outline }, h)]),
      h.div(
        [h.Id('trailing')],
        [
          Button.view(
            { label: 'More', trailing: h.span([h.Id('count')], ['12']), style: plain },
            h,
          ),
        ],
      ),
      h.div(
        [h.Id('described')],
        [Button.view({ label: 'Deploy', description: 'To production', style: plain }, h)],
      ),
      h.div([h.Id('single')], [Button.view({ label: 'Deploy', style: plain }, h)]),
      h.div(
        [h.Id('marked')],
        [Button.view({ label: 'Inbox', mark: h.span([h.Id('dot')], [dot(h)]), style: plain }, h)],
      ),
      h.div(
        [h.Id('marked-rtl'), h.Attribute('dir', 'rtl')],
        [Button.view({ label: 'Inbox', mark: dot(h), style: plain }, h)],
      ),
      h.div([h.Id('away')], [h.span([h.Id('nowhere')], ['Elsewhere'])]),
    ],
  )

const mount = async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + every.map(style => style.css).join('')
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'button-parts'
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
  await vi.waitFor(() => expect(document.getElementById('size-xs')).not.toBeNull())
  return handle
}

const buttonIn = (id: string) => document.getElementById(id)!.querySelector('button')!

test('the sizes step down to xs, each a shorter button than the last', async () => {
  const handle = await mount()
  try {
    const [xs, sm, md, lg] = (['xs', 'sm', 'md', 'lg'] as const).map(
      size => buttonIn(`size-${size}`).getBoundingClientRect().height,
    )
    expect(xs!).toBeLessThan(sm!)
    expect(sm!).toBeLessThan(md!)
    expect(md!).toBeLessThan(lg!)
  } finally {
    handle.dispose()
  }
})

test('a link button has no fill and no side padding, and underlines under the pointer', async () => {
  const handle = await mount()
  try {
    const button = buttonIn('link')
    const rest = getComputedStyle(button)
    expect(rest.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(Number.parseFloat(rest.paddingInlineStart)).toBe(0)
    expect(rest.textDecorationLine).toBe('none')
    await userEvent.hover(button)
    await vi.waitFor(() => expect(getComputedStyle(button).textDecorationLine).toBe('underline'))
    // The pointer goes somewhere known, for the tests after this one.
    await userEvent.hover(document.getElementById('nowhere')!)
  } finally {
    handle.dispose()
  }
})

test('an invalid button takes the danger colors, and a valid one keeps its own', async () => {
  const handle = await mount()
  try {
    const fine = getComputedStyle(buttonIn('fine'))
    const invalid = getComputedStyle(buttonIn('invalid'))
    expect(invalid.borderTopColor).not.toBe(fine.borderTopColor)
    expect(invalid.color).not.toBe(fine.color)
    const probe = document.createElement('span')
    probe.style.color = 'var(--fk-error-outline)'
    document.body.append(probe)
    expect(invalid.borderTopColor).toBe(getComputedStyle(probe).color)
  } finally {
    handle.dispose()
  }
})

test('a trailing drawing sits after the label, on the same line', async () => {
  const handle = await mount()
  try {
    const button = buttonIn('trailing')
    const count = document.getElementById('count')!.getBoundingClientRect()
    const box = button.getBoundingClientRect()
    expect(count.left).toBeGreaterThan(box.left + box.width / 2)
    expect(count.right).toBeLessThanOrEqual(box.right)
    expect(count.top).toBeGreaterThanOrEqual(box.top)
    expect(count.bottom).toBeLessThanOrEqual(box.bottom)
  } finally {
    handle.dispose()
  }
})

test('a description is a second, smaller line, and the button grows to hold it', async () => {
  const handle = await mount()
  try {
    const button = buttonIn('described')
    const label = button.firstElementChild!
    const description = label.firstElementChild!
    expect(button.getBoundingClientRect().height).toBeGreaterThan(
      buttonIn('single').getBoundingClientRect().height,
    )
    expect(Number.parseFloat(getComputedStyle(description).fontSize)).toBeLessThan(
      Number.parseFloat(getComputedStyle(button).fontSize),
    )
    // The two lines have room above and below, which a one-line button gets from its height.
    expect(Number.parseFloat(getComputedStyle(label).paddingBlockStart)).toBeGreaterThan(0)
    expect(description.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      label.getBoundingClientRect().top,
    )
  } finally {
    handle.dispose()
  }
})

test('a corner mark sits half out of the end corner, and on the other one when mirrored', async () => {
  const handle = await mount()
  try {
    const box = buttonIn('marked').getBoundingClientRect()
    const mark = buttonIn('marked').lastElementChild!.getBoundingClientRect()
    expect(mark.right).toBeGreaterThan(box.right)
    expect(mark.top).toBeLessThan(box.top)
    const mirroredBox = buttonIn('marked-rtl').getBoundingClientRect()
    const mirrored = buttonIn('marked-rtl').lastElementChild!.getBoundingClientRect()
    expect(mirrored.left).toBeLessThan(mirroredBox.left)
  } finally {
    handle.dispose()
  }
})
