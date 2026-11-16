/**
 * A horizontal listbox in a real browser: right to left, its CSS reads that
 * direction too, ArrowLeft moves to the next item and ArrowRight moves back.
 */
import { Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { holdFrames, renderBehindTheQueue } from './frames.js'
import { marksThrough } from './observe.js'
import { Listbox, ListboxSlots, ListboxView, Recipes } from '../src/index.js'
import * as UpstreamListbox from '@foldkit/ui/listbox'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(ListboxSlots)(Recipes.Listbox({}))
const Frequencies = ListboxView.create<string>()
const Model = UpstreamListbox.Model
type Model = typeof Model.Type
type Message = UpstreamListbox.Message

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const FREQUENCIES = ['Hourly', 'Daily', 'Overnight']

/** What the listbox's `update` reported chosen, as upstream names it. */
let chosen: ReadonlyArray<unknown> = []

type Layout = {
  readonly items?: ReadonlyArray<string>
  readonly orientation?: 'Horizontal' | 'Vertical'
  readonly direction?: 'ltr' | 'rtl'
}

const mount = (isAnimated = false, layout: Layout = {}) => {
  chosen = []
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'listbox-rtl-browser'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    // No `dir` of the page's: the listbox draws its own from `direction`.
    h.div(
      [],
      [
        Frequencies.view(
          model,
          {
            anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
            items: layout.items ?? FREQUENCIES,
            maybeSelectedValue: Option.none(),
            itemToConfig: (frequency: string) => ({ content: h.span([], [frequency]) }),
            buttonContent: h.span([], ['Frequency']),
            toView: Listbox.toView([style.mixin], { h }),
            direction: layout.direction ?? 'rtl',
          },
          h,
        ),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          ...UpstreamListbox.init({
            id: 'ladder',
            orientation: layout.orientation ?? ('Horizontal' as const),
            isAnimated,
          }),
        },
      }),
      update: (model: Model, message: Message) => {
        const next = Frequencies.update(model, message)
        if (next.outMessage !== undefined) chosen = [...chosen, next.outMessage]
        return {
          model: next.model,
          commands: next.commands === undefined ? [] : next.commands,
        }
      },
      view,
    }),
  )
}

test('right to left, ArrowLeft moves to the next item and ArrowRight moves back', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.querySelector('button[aria-haspopup]')).not.toBeNull())
    document.querySelector<HTMLElement>('button[aria-haspopup]')!.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() =>
      expect(
        document.querySelector('[role="listbox"]')?.getAttribute('aria-activedescendant'),
      ).toBe('ladder-item-0'),
    )
    // The CSS reads the direction the keys do.
    expect(document.querySelector('[role="listbox"]')!.matches(':dir(rtl)')).toBe(true)
    await userEvent.keyboard('{ArrowLeft}')
    await vi.waitFor(() =>
      expect(
        document.querySelector('[role="listbox"]')?.getAttribute('aria-activedescendant'),
      ).toBe('ladder-item-1'),
    )
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() =>
      expect(
        document.querySelector('[role="listbox"]')?.getAttribute('aria-activedescendant'),
      ).toBe('ladder-item-0'),
    )
  } finally {
    handle.dispose()
  }
})

test('a listbox leaving draws its fade though a render frame is put off (#400)', async () => {
  const handle = mount(true)
  try {
    const button = await vi.waitFor(() => {
      const found = document.getElementById('ladder-button')
      expect(found).not.toBeNull()
      return found!
    })
    button.focus()
    await userEvent.keyboard('{Enter}')
    const panel = await vi.waitFor(() => {
      const found = document.getElementById('ladder-items')
      expect(found).not.toBeNull()
      expect(found!.hasAttribute('data-closed')).toBe(false)
      return found!
    })
    const restore = renderBehindTheQueue('ladder-items')
    try {
      const states = await marksThrough(
        panel,
        ['closed', 'leave'],
        () => userEvent.keyboard('{Escape}'),
        () => vi.waitFor(() => expect(document.getElementById('ladder-items')).toBeNull()),
      )
      expect(states).toContain('closed leave')
    } finally {
      restore()
    }
  } finally {
    handle.dispose()
  }
})

const FRUIT = ['Apple', 'Avocado', 'Banana', 'Blueberry', 'Cherry', 'Damson']
const column: Layout = { items: FRUIT, orientation: 'Vertical', direction: 'ltr' }

const activeItem = () => {
  const id = document.getElementById('ladder-items')?.getAttribute('aria-activedescendant')
  return id === null || id === undefined ? '' : (document.getElementById(id)?.textContent ?? '')
}

const openOn = async (key: string) => {
  await vi.waitFor(() => expect(document.getElementById('ladder-button')).not.toBeNull())
  document.getElementById('ladder-button')!.focus()
  await userEvent.keyboard(key)
}

/** Opens the listbox, then types `keys` in one frame: the page draws nothing in between. */
const burst = async (keys: string, layout: Layout = column) => {
  const handle = mount(false, layout)
  await openOn('{Enter}')
  await vi.waitFor(() => expect(activeItem()).toBe(layout.items?.[0] ?? ''))
  const release = holdFrames()
  try {
    await userEvent.keyboard(keys)
  } finally {
    release()
  }
  return handle
}

// Keys come faster than frames: a held key repeating on a busy page sends several before the
// next drawing, and each continues from where the previous one of this drawing left off.
test.each([
  ['{ArrowDown}{ArrowDown}{ArrowDown}', 'Blueberry'],
  ['{ArrowDown}{ArrowDown}{ArrowUp}', 'Avocado'],
  ['{ArrowUp}{ArrowUp}', 'Cherry'],
  ['{End}{ArrowUp}', 'Cherry'],
  ['{End}{ArrowDown}{ArrowDown}{ArrowDown}', 'Banana'],
  ['{ArrowDown}{ArrowDown}{Home}{ArrowDown}{ArrowDown}', 'Banana'],
] as const)('keys %s before the next frame leave the active item at %s', async (keys, last) => {
  const handle = await burst(keys)
  try {
    await vi.waitFor(() => expect(activeItem()).toBe(last))
  } finally {
    handle.dispose()
  }
})

test('Enter after two ArrowDowns before the next frame chooses the item the second reached', async () => {
  const handle = await burst('{ArrowDown}{ArrowDown}{Enter}')
  try {
    await vi.waitFor(() => expect(JSON.stringify(chosen)).toContain('Banana'))
  } finally {
    handle.dispose()
  }
})

test('a Space typed after letters before the next frame continues the search instead of choosing', async () => {
  const handle = await burst('b ')
  try {
    await vi.waitFor(() => expect(activeItem()).toBe('Banana'))
    await new Promise(done => setTimeout(done, 50))
    expect(chosen).toEqual([])
  } finally {
    handle.dispose()
  }
})

test('type-ahead keys before the next frame refine one query from the item the first reached', async () => {
  const handle = await burst('bl')
  try {
    await vi.waitFor(() => expect(activeItem()).toBe('Blueberry'))
  } finally {
    handle.dispose()
  }
})

test('an arrow after type-ahead before the next frame moves on from the item the search reached', async () => {
  const handle = await burst('b{ArrowDown}')
  try {
    await vi.waitFor(() => expect(activeItem()).toBe('Blueberry'))
  } finally {
    handle.dispose()
  }
})

test('right to left, ArrowLeft keys before the next frame each move to the next item', async () => {
  const handle = await burst('{ArrowLeft}{ArrowLeft}{ArrowRight}{ArrowLeft}', {
    items: FRUIT,
    orientation: 'Horizontal',
    direction: 'rtl',
  })
  try {
    await vi.waitFor(() => expect(activeItem()).toBe('Banana'))
  } finally {
    handle.dispose()
  }
})

test('ArrowDown twice before the next frame on a closed listbox opens it and moves to the second item', async () => {
  const handle = mount(false, column)
  try {
    await vi.waitFor(() => expect(document.getElementById('ladder-button')).not.toBeNull())
    document.getElementById('ladder-button')!.focus()
    const release = holdFrames()
    try {
      await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    } finally {
      release()
    }
    await vi.waitFor(() => expect(activeItem()).toBe('Avocado'))
  } finally {
    handle.dispose()
  }
})

test('one key a frame still moves one item each', async () => {
  const handle = mount(false, column)
  try {
    await openOn('{Enter}')
    await vi.waitFor(() => expect(activeItem()).toBe('Apple'))
    for (const [key, item] of [
      ['{ArrowDown}', 'Avocado'],
      ['{ArrowDown}', 'Banana'],
      ['{ArrowUp}', 'Avocado'],
    ] as const) {
      await userEvent.keyboard(key)
      await vi.waitFor(() => expect(activeItem()).toBe(item))
    }
  } finally {
    handle.dispose()
  }
})
