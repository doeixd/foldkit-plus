/// <reference types="@vitest/browser-playwright" />
/**
 * Toolbar in a real browser: one tab stop that returns to the control focused
 * last, arrows, Home and End moving real focus past a disabled control, the
 * keys a text field or a select uses left to it, a press that starts in a
 * widget the toolbar did not draw left alone, mirroring under right-to-left,
 * and the recipe's size lining controls up.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Button, Recipes, Toolbar, ToolbarSlots } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(ToolbarSlots)(Recipes.Toolbar({}))
const buttonStyle = Style.forSlots(Button.ButtonSlots)(Recipes.Button({}))

const Model = Schema.Struct({ current: Schema.NullOr(Schema.String) })
const Msg = defineMessageUnion({ Focused: { id: Schema.String } })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.body.removeAttribute('dir')
})

interface Options {
  readonly orientation?: 'horizontal' | 'vertical'
  readonly dir?: 'rtl'
  readonly size?: 'sm' | 'md' | 'lg'
  readonly loop?: boolean
}

const mount = (
  entries: (h: HtmlBuilder<typeof Msg.Type>) => ReadonlyArray<Toolbar.ToolbarItem<typeof Msg.Type>>,
  options: Options = {},
) => {
  const bar = Style.forSlots(ToolbarSlots)(
    Recipes.Toolbar(options.size === undefined ? {} : { size: options.size }),
  )
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    bar.css +
    buttonStyle.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'toolbar-browser'
  document.body.dir = options.dir ?? 'ltr'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { current: null } }),
      update: (
        model: typeof Model.Type,
        message: typeof Msg.Type,
      ): Return<typeof Model.Type, typeof Msg.Type> =>
        Msg.match(message, {
          Focused: ({ id }) => ({ model: modifyFields(model, { current: () => id }) }),
        }),
      view: (model: typeof Model.Type, h: HtmlBuilder<typeof Msg.Type>) =>
        h.div(
          [h.Id('page')],
          [
            h.input([h.Id('before'), h.Type('text')]),
            Toolbar.view(
              {
                id: 'bar',
                label: 'Formatting',
                roving: { current: model.current },
                onFocus: id => Msg.Focused({ id }),
                items: entries(h),
                orientation: options.orientation,
                direction: options.dir === 'rtl' ? 'rtl' : 'ltr',
                loop: options.loop,
                style: bar,
              },
              h,
            ),
            h.input([h.Id('after'), h.Type('text')]),
          ],
        ),
    }),
  )
}

const tool =
  (id: string, disabled?: boolean) =>
  (h: HtmlBuilder<typeof Msg.Type>): Toolbar.ToolbarControl<typeof Msg.Type> => ({
    id,
    disabled,
    draw: control =>
      Button.view(
        {
          label: id,
          disabled: control.disabled,
          attributes: { button: control.attributes },
          style: buttonStyle,
        },
        h,
      ),
  })

const basic = (
  h: HtmlBuilder<typeof Msg.Type>,
): ReadonlyArray<Toolbar.ToolbarItem<typeof Msg.Type>> => [
  tool('bold')(h),
  tool('italic', true)(h),
  tool('link')(h),
  tool('code')(h),
]

const active = () => document.activeElement?.id ?? ''
const ready = () =>
  vi.waitFor(() => expect(document.querySelector('[role="toolbar"] button')).not.toBeNull())

const focusBefore = async () => {
  await ready()
  document.querySelector<HTMLElement>('#before')!.focus()
}

test('Tab enters at the first control, the arrows skip the disabled one, and Tab leaves the toolbar', async () => {
  const handle = mount(basic)
  try {
    await focusBefore()
    await userEvent.tab()
    expect(active()).toBe('bar-bold')
    await userEvent.keyboard('{ArrowRight}')
    expect(active()).toBe('bar-link')
    await userEvent.keyboard('{End}')
    expect(active()).toBe('bar-code')
    await userEvent.keyboard('{ArrowRight}')
    expect(active()).toBe('bar-bold')
    await userEvent.keyboard('{ArrowLeft}')
    expect(active()).toBe('bar-code')
    await userEvent.keyboard('{Home}')
    expect(active()).toBe('bar-bold')
    await userEvent.tab()
    expect(active()).toBe('after')
  } finally {
    handle.dispose()
  }
})

test('coming back with Tab or Shift+Tab lands on the control focused last', async () => {
  const handle = mount(basic)
  try {
    await focusBefore()
    await userEvent.tab()
    await userEvent.keyboard('{ArrowRight}')
    expect(active()).toBe('bar-link')
    await userEvent.tab()
    expect(active()).toBe('after')
    await userEvent.tab({ shift: true })
    expect(active()).toBe('bar-link')
    await userEvent.tab({ shift: true })
    expect(active()).toBe('before')
    await userEvent.tab()
    expect(active()).toBe('bar-link')
  } finally {
    handle.dispose()
  }
})

test('a press on a control moves the tab stop to it', async () => {
  const handle = mount(basic)
  try {
    await ready()
    await userEvent.click(document.querySelector<HTMLElement>('#bar-code')!)
    await userEvent.tab()
    expect(active()).toBe('after')
    await userEvent.tab({ shift: true })
    expect(active()).toBe('bar-code')
  } finally {
    handle.dispose()
  }
})

test('without loop the arrows stop at the ends', async () => {
  const handle = mount(basic, { loop: false })
  try {
    await focusBefore()
    await userEvent.tab()
    await userEvent.keyboard('{ArrowLeft}')
    expect(active()).toBe('bar-bold')
    await userEvent.keyboard('{End}{ArrowRight}')
    expect(active()).toBe('bar-code')
  } finally {
    handle.dispose()
  }
})

test('a vertical toolbar moves by Up and Down and leaves Left and Right alone', async () => {
  const handle = mount(basic, { orientation: 'vertical' })
  try {
    await focusBefore()
    await userEvent.tab()
    await userEvent.keyboard('{ArrowRight}')
    expect(active()).toBe('bar-bold')
    await userEvent.keyboard('{ArrowDown}')
    expect(active()).toBe('bar-link')
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(active()).toBe('bar-code')
  } finally {
    handle.dispose()
  }
})

test('right-to-left mirrors the arrows of a horizontal toolbar', async () => {
  const handle = mount(basic, { dir: 'rtl' })
  try {
    await focusBefore()
    await userEvent.tab()
    expect(active()).toBe('bar-bold')
    await userEvent.keyboard('{ArrowLeft}')
    expect(active()).toBe('bar-link')
    await userEvent.keyboard('{ArrowRight}')
    expect(active()).toBe('bar-bold')
    const bold = document.querySelector('#bar-bold')!.getBoundingClientRect()
    const link = document.querySelector('#bar-link')!.getBoundingClientRect()
    expect(bold.left).toBeGreaterThan(link.left)
  } finally {
    handle.dispose()
  }
})

const withField = (
  h: HtmlBuilder<typeof Msg.Type>,
): ReadonlyArray<Toolbar.ToolbarItem<typeof Msg.Type>> => [
  tool('bold')(h),
  {
    id: 'size',
    draw: control =>
      h.input([...control.attributes, h.Type('text'), h.AriaLabel('Size'), h.Value('12')]),
  },
  tool('link')(h),
]

test('a text field keeps the keys that move its caret, and the arrows leave it only from its edge', async () => {
  const handle = mount(withField)
  try {
    await focusBefore()
    await userEvent.tab()
    await userEvent.keyboard('{ArrowRight}')
    expect(active()).toBe('bar-size')
    const field = document.querySelector<HTMLInputElement>('#bar-size')!
    field.setSelectionRange(1, 1)
    await userEvent.keyboard('{ArrowRight}')
    expect(active()).toBe('bar-size')
    expect(field.selectionStart).toBe(2)
    await userEvent.keyboard('{ArrowLeft}')
    expect(active()).toBe('bar-size')
    await userEvent.keyboard('{Home}')
    expect(field.selectionStart).toBe(0)
    expect(active()).toBe('bar-size')
    await userEvent.keyboard('{ArrowLeft}')
    expect(active()).toBe('bar-bold')
    document.querySelector<HTMLElement>('#bar-size')!.focus()
    field.setSelectionRange(2, 2)
    await userEvent.keyboard('{ArrowRight}')
    expect(active()).toBe('bar-link')
  } finally {
    handle.dispose()
  }
})

test('right-to-left reads the caret keys of a text field by the page direction', async () => {
  const handle = mount(withField, { dir: 'rtl' })
  try {
    await ready()
    const field = document.querySelector<HTMLInputElement>('#bar-size')!
    field.focus()
    field.setSelectionRange(1, 1)
    // Backward on a right-to-left page is Right: the field keeps it until its start.
    await userEvent.keyboard('{ArrowRight}')
    expect(active()).toBe('bar-size')
    expect(field.selectionStart).toBe(0)
    await userEvent.keyboard('{ArrowRight}')
    expect(active()).toBe('bar-bold')
  } finally {
    handle.dispose()
  }
})

test("a selection in a text field is the field's, even at an edge", async () => {
  const handle = mount(withField)
  try {
    await ready()
    const field = document.querySelector<HTMLInputElement>('#bar-size')!
    field.focus()
    field.setSelectionRange(0, 2)
    await userEvent.keyboard('{ArrowLeft}')
    expect(active()).toBe('bar-size')
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe(0)
  } finally {
    handle.dispose()
  }
})

test('a select keeps its arrows and Home and End', async () => {
  const handle = mount(h => [
    tool('bold')(h),
    {
      id: 'family',
      draw: control =>
        h.select(
          [...control.attributes, h.AriaLabel('Family')],
          ['Serif', 'Sans', 'Mono'].map(name => h.option([h.Value(name)], [name])),
        ),
    },
    tool('link')(h),
  ])
  try {
    await ready()
    const select = document.querySelector<HTMLSelectElement>('#bar-family')!
    select.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(active()).toBe('bar-family')
    expect(select.value).toBe('Sans')
    await userEvent.keyboard('{ArrowRight}')
    expect(active()).toBe('bar-family')
    await userEvent.keyboard('{End}')
    expect(select.value).toBe('Mono')
    expect(active()).toBe('bar-family')
  } finally {
    handle.dispose()
  }
})

test('a key pressed in something the toolbar did not draw is left to it', async () => {
  const handle = mount(h => [
    tool('bold')(h),
    {
      id: 'split',
      draw: control =>
        h.span(
          [],
          [
            h.button([...control.attributes, h.Type('button')], ['Paste']),
            h.button([h.Id('split-more'), h.Type('button')], ['More']),
          ],
        ),
    },
    tool('link')(h),
  ])
  try {
    await ready()
    const reached: Array<boolean> = []
    document.body.addEventListener('keydown', event => reached.push(event.defaultPrevented))
    document.querySelector<HTMLElement>('#split-more')!.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(active()).toBe('split-more')
    expect(reached).toEqual([false])
  } finally {
    handle.dispose()
  }
})

test('groups and separators draw with their own geometry, in either orientation', async () => {
  const entries = (
    h: HtmlBuilder<typeof Msg.Type>,
  ): ReadonlyArray<Toolbar.ToolbarItem<typeof Msg.Type>> => [
    tool('bold')(h),
    'separator',
    {
      label: 'Align',
      controls: [tool('left')(h), tool('right')(h)],
    },
  ]
  const handle = mount(entries)
  try {
    await ready()
    const separator = document.querySelector('[role="separator"]')!.getBoundingClientRect()
    expect(separator.width).toBeGreaterThan(0)
    expect(separator.width).toBeLessThanOrEqual(2)
    expect(separator.height).toBeGreaterThan(10)
    const group = document.querySelector('[role="group"]')!
    expect(group.getAttribute('aria-label')).toBe('Align')
    await userEvent.click(document.querySelector<HTMLElement>('#bar-left')!)
    await userEvent.keyboard('{ArrowRight}')
    expect(active()).toBe('bar-right')
    await userEvent.keyboard('{ArrowRight}')
    expect(active()).toBe('bar-bold')
  } finally {
    handle.dispose()
  }
})

test('a vertical toolbar draws its separator as a horizontal rule', async () => {
  const handle = mount(h => [tool('a')(h), 'separator', tool('b')(h)], {
    orientation: 'vertical',
  })
  try {
    await ready()
    const separator = document.querySelector('[role="separator"]')!.getBoundingClientRect()
    expect(separator.height).toBeGreaterThan(0)
    expect(separator.height).toBeLessThanOrEqual(2)
    expect(separator.width).toBeGreaterThan(10)
  } finally {
    handle.dispose()
  }
})

test("the toolbar's size steps the buttons it holds: sm, md, lg grow", async () => {
  const heights: Array<number> = []
  for (const size of ['sm', 'md', 'lg'] as const) {
    const handle = mount(basic, { size })
    try {
      await ready()
      heights.push(document.querySelector('#bar-bold')!.getBoundingClientRect().height)
    } finally {
      handle.dispose()
      document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
      document.body.replaceChildren()
    }
  }
  expect(heights[0]).toBeLessThan(heights[1]!)
  expect(heights[1]).toBeLessThan(heights[2]!)
})
