/// <reference types="@vitest/browser-playwright" />
/**
 * TagsInput in a real browser: keys typed faster than a frame still add the
 * tag, a refused commit shakes the field once and a second refusal plays
 * the shake again, and under reduced motion, or a theme with no travel,
 * the field does not move.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { chipMeasures } from './chipMeasures.js'
import { holdFrames } from './frames.js'
import { Recipes, TagsInput, TagsInputSlots } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(TagsInputSlots)(Recipes.TagsInput({}))

const reduce = (value: 'reduce' | 'no-preference') =>
  cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value }],
  })

afterEach(async () => {
  await reduce('no-preference')
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/**
 * Each Message `update` received this mount, with the draft, tags and input
 * value after it: a burst's failure seen only on CI says what happened.
 */
let handled: Array<string> = []

const mount = (tags: ReadonlyArray<string> = [], addOnBlur = false) => {
  handled = []
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
  container.id = 'tags-input-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model: TagsInput.Model,
      container,
      init: () => ({ model: TagsInput.init({ id: 'topics', tags }) }),
      update: (model: TagsInput.Model, message: TagsInput.Message) => {
        const next = TagsInput.update(model, message)
        const field = document.getElementById('topics-input') as HTMLInputElement | null
        handled.push(
          JSON.stringify([message, next.model.draft, next.model.tags, field?.value ?? null]),
        )
        return { model: next.model, commands: next.commands ?? [] }
      },
      view: (model: TagsInput.Model, h: HtmlBuilder<TagsInput.Message>) =>
        TagsInput.view(
          { model, onMessage: message => message, label: 'Topics', style, addOnBlur },
          h,
        ),
    }),
  )
}

const input = () => document.getElementById('topics-input')!
const control = () => input().parentElement!
const tagTexts = () => [...document.querySelectorAll('li')].map(tag => tag.firstChild?.textContent)
const status = () => document.getElementById('topics-message')!

test('a tag typed and committed in one burst is added, and its repeat shakes the field', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
    input().focus()
    await userEvent.keyboard('react{Enter}react{Enter}')
    await vi.waitFor(() =>
      expect(status().textContent, handled.join('\n')).toBe('react is already added'),
    )
    expect([...document.querySelectorAll('li')].map(tag => tag.firstChild?.textContent)).toEqual([
      'react',
    ])
    // Refused whole, the draft stays to be seen.
    expect((input() as HTMLInputElement).value).toBe('react')
    const first = getComputedStyle(control()).animationName
    expect(first).not.toBe('none')
    expect(getComputedStyle(control()).animationDuration).not.toBe('0s')
    await userEvent.keyboard('{Enter}')
    // The second refusal plays another shake, under the other name.
    await vi.waitFor(() => expect(getComputedStyle(control()).animationName).not.toBe(first))
    expect(getComputedStyle(control()).animationName).not.toBe('none')
  } finally {
    handle.dispose()
  }
})

test('a frame drawn mid-burst, its draft the start of the tag just added, keeps the draft', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
    input().focus()
    // Frames wait, as on a loaded machine, until they are let through.
    const frames: Array<FrameRequestCallback> = []
    const held = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(frame => {
      frames.push(frame)
      return frames.length
    })
    const draw = () => frames.splice(0).forEach(frame => frame(performance.now()))
    try {
      await userEvent.keyboard('react{Enter}reac')
      expect((input() as HTMLInputElement).value).toBe('reactreac')
      // Drawn once the keys are handled, the input shows the draft alone, and a key completes it.
      await vi.waitFor(() => {
        draw()
        expect((input() as HTMLInputElement).value).toBe('reac')
      })
      await userEvent.keyboard('t{Enter}')
    } finally {
      held.mockRestore()
      draw()
    }
    await vi.waitFor(() =>
      expect(status().textContent, handled.join('\n')).toBe('react is already added'),
    )
  } finally {
    handle.dispose()
  }
})

test('Backspace edits text typed since the last frame, and takes a tag only from an empty field', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
    input().focus()
    await userEvent.keyboard('x{Enter}')
    await vi.waitFor(() => expect(tagTexts()).toEqual(['x']))
    const frames: Array<FrameRequestCallback> = []
    const held = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(frame => {
      frames.push(frame)
      return frames.length
    })
    const draw = () => frames.splice(0).forEach(frame => frame(performance.now()))
    try {
      // The drawing holds an empty draft beside a tag, and the input `ab`: the key edits the text.
      await userEvent.keyboard('ab{Backspace}')
      expect((input() as HTMLInputElement).value).toBe('a')
    } finally {
      held.mockRestore()
      draw()
    }
    await userEvent.keyboard('{Backspace}')
    await vi.waitFor(() => expect((input() as HTMLInputElement).value).toBe(''))
    expect(tagTexts()).toEqual(['x'])
    await userEvent.keyboard('{Backspace}')
    await vi.waitFor(() => expect(tagTexts()).toEqual([]))
  } finally {
    handle.dispose()
  }
})

const focused = () =>
  document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.id

test('the chips are one tab stop, and the arrows, Home and End move focus among them', async () => {
  const handle = mount(['a', 'b', 'c'])
  try {
    await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
    input().focus()
    await userEvent.tab({ shift: true })
    expect(focused()).toBe('Remove c')
    await userEvent.keyboard('{ArrowLeft}')
    expect(focused()).toBe('Remove b')
    await userEvent.keyboard('{Home}')
    expect(focused()).toBe('Remove a')
    // The tab stop followed focus: Tab from the input now comes back to `a`.
    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll('li button')].map(button => button.getAttribute('tabindex')),
      ).toEqual(['0', '-1', '-1']),
    )
    await userEvent.keyboard('{End}')
    expect(focused()).toBe('Remove c')
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(input())
  } finally {
    handle.dispose()
  }
})

test('ArrowLeft in the input leaves it only from the start of its text', async () => {
  const handle = mount(['a', 'b'])
  try {
    await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
    input().focus()
    await userEvent.keyboard('xy')
    await vi.waitFor(() => expect((input() as HTMLInputElement).value).toBe('xy'))
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(input())
    expect((input() as HTMLInputElement).selectionStart).toBe(1)
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(input())
    expect((input() as HTMLInputElement).selectionStart).toBe(0)
    // A selection from the start is the browser's to collapse.
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}{ArrowLeft}')
    expect(document.activeElement).toBe(input())
    await userEvent.keyboard('{ArrowLeft}')
    expect(focused()).toBe('Remove b')
    // The text is still there to come back to.
    expect((input() as HTMLInputElement).value).toBe('xy')
  } finally {
    handle.dispose()
  }
})

test('removing a chip from the keyboard focuses the one that takes its place, else the input', async () => {
  const handle = mount(['a b', 'say "hi"', 'c'])
  try {
    await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
    input().focus()
    await userEvent.tab({ shift: true })
    await userEvent.keyboard('{ArrowLeft}')
    expect(focused()).toBe('Remove say "hi"')
    await userEvent.keyboard('{Delete}')
    await vi.waitFor(() => expect(focused()).toBe('Remove c'))
    expect(tagTexts()).toEqual(['a b', 'c'])
    await userEvent.keyboard('{Backspace}')
    await vi.waitFor(() => expect(focused()).toBe('Remove a b'))
    await userEvent.keyboard('{Backspace}')
    await vi.waitFor(() => expect(document.activeElement).toBe(input()))
    expect(tagTexts()).toEqual([])
  } finally {
    handle.dispose()
  }
})

/** Focuses the chip of `tag` from the input, with the keyboard. */
const toChip = async (tags: ReadonlyArray<string>, tag: string) => {
  input().focus()
  await userEvent.tab({ shift: true })
  for (let at = tags.length - 1; at > tags.indexOf(tag); at--)
    await userEvent.keyboard('{ArrowLeft}')
  expect(focused()).toBe(`Remove ${tag}`)
}

// Keys come faster than frames: a held key repeating on a busy page sends several before the
// next drawing, and each continues from the chip the previous one reached.
test.each([
  [['a', 'b', 'c', 'd'], 'b', '{Backspace}{Backspace}', ['a', 'd'], 'Remove d'],
  [['a', 'b', 'c', 'd'], 'b', '{Delete}{Backspace}{Backspace}', ['a'], 'Remove a'],
  [['a', 'b', 'c'], 'b', '{Backspace}{Backspace}{Backspace}', [], 'topics-input'],
] as const)(
  'chips %j from %s: keys %s before the next frame leave %j and focus %s',
  async (tags, from, keys, left, at) => {
    const handle = mount(tags)
    try {
      await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
      await toChip(tags, from)
      const release = holdFrames()
      try {
        await userEvent.keyboard(keys)
      } finally {
        release()
      }
      await vi.waitFor(() => expect(tagTexts()).toEqual(left))
      await vi.waitFor(() => expect(focused()).toBe(at))
    } finally {
      handle.dispose()
    }
  },
)

test('arrows before the next frame walk the chips from the one the previous reached', async () => {
  const handle = mount(['a', 'b', 'c', 'd'])
  try {
    await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
    input().focus()
    const release = holdFrames()
    try {
      await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{Home}{ArrowRight}{ArrowRight}')
    } finally {
      release()
    }
    await vi.waitFor(() => expect(focused()).toBe('Remove c'))
  } finally {
    handle.dispose()
  }
})

test('Backspace twice in an empty field before the next frame takes two tags', async () => {
  const handle = mount(['a', 'b', 'c'])
  try {
    await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
    input().focus()
    const release = holdFrames()
    try {
      await userEvent.keyboard('{Backspace}{Backspace}')
    } finally {
      release()
    }
    await vi.waitFor(() => expect(tagTexts()).toEqual(['a']))
  } finally {
    handle.dispose()
  }
})

test.each([
  [true, ['abc'], ''],
  [false, [], 'abc'],
] as const)(
  'with addOnBlur %s, leaving the input holds the draft as tags %j',
  async (addOnBlur, tags, draft) => {
    const handle = mount([], addOnBlur)
    try {
      await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
      input().focus()
      await userEvent.keyboard('abc')
      await vi.waitFor(() => expect((input() as HTMLInputElement).value).toBe('abc'))
      ;(document.activeElement as HTMLElement).blur()
      await vi.waitFor(() => expect(tagTexts()).toEqual(tags))
      await vi.waitFor(() => expect((input() as HTMLInputElement).value).toBe(draft))
    } finally {
      handle.dispose()
    }
  },
)

test('under reduced motion a refusal does not move the field', async () => {
  await reduce('reduce')
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
    input().focus()
    await userEvent.keyboard(' {Enter}')
    await vi.waitFor(() => expect(status().textContent).toBe('Type a tag to add'))
    // The reset's floor under reduced motion, which a duration of 0 meets.
    expect(parseFloat(getComputedStyle(control()).animationDuration)).toBeLessThan(0.001)
  } finally {
    handle.dispose()
  }
})

test('a theme with no travel stills the shake', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
    control().style.setProperty('--fk-knob-travel', '0')
    input().focus()
    await userEvent.keyboard(' {Enter}')
    await vi.waitFor(() => expect(status().textContent).toBe('Type a tag to add'))
    expect(getComputedStyle(control()).animationDuration).toBe('0s')
  } finally {
    handle.dispose()
  }
})

test('a chip holds its remove button as the pill’s end cap: equal room on three sides, the sign centred', async () => {
  const handle = mount(['foldkit'])
  try {
    await vi.waitFor(() => expect(document.querySelector('li button')).not.toBeNull())
    const chip = document.querySelector('li')!.getBoundingClientRect()
    const button = document.querySelector('li button') as HTMLElement
    const box = button.getBoundingClientRect()
    const above = box.top - chip.top
    expect(box.width).toBe(box.height)
    expect(chip.bottom - box.bottom).toBeCloseTo(above, 1)
    expect(chip.right - box.right).toBeCloseTo(above, 1)
    expect(getComputedStyle(button).borderRadius).not.toBe('0px')
    // The sign is two strokes, each centred by its own middle on the button's: font metrics cannot move it.
    for (const part of ['::before', '::after'] as const) {
      const stroke = getComputedStyle(button, part)
      expect(stroke.position).toBe('absolute')
      expect(parseFloat(stroke.left)).toBeCloseTo(box.width / 2, 1)
      expect(parseFloat(stroke.top)).toBeCloseTo(box.height / 2, 1)
      expect(stroke.translate).toBe('-50% -50%')
    }
    expect(getComputedStyle(button, '::before').rotate).not.toBe(
      getComputedStyle(button, '::after').rotate,
    )
    // The text stays in the button for a copy and a search, drawn at no size.
    expect(button.textContent).toBe('×')
    expect(getComputedStyle(button).fontSize).toBe('0px')
  } finally {
    handle.dispose()
  }
})

const faces = ['"Segoe UI", sans-serif', 'Verdana, sans-serif', 'Georgia, serif']
const roundness = ['0.45', '1', '2']
const textScales = ['1', '1.5']

test.each(faces)('the label and the mark are centred on the pill’s middle, in %s', async face => {
  const handle = mount(['foldkit', 'effect', 'typing'])
  try {
    await vi.waitFor(() => expect(document.querySelectorAll('li button')).toHaveLength(3))
    for (const radius of roundness) {
      for (const scale of textScales) {
        const sheet = document.createElement('style')
        sheet.dataset['test'] = ''
        sheet.textContent = `:root{--fk-knob-radius-factor:${radius};--fk-knob-text-scale:${scale}}body{font-family:${face}}`
        document.head.append(sheet)
        for (const chip of document.querySelectorAll<HTMLElement>('li')) {
          const m = chipMeasures(chip)
          const where = `${face} radius ${radius} scale ${scale}: ${JSON.stringify(m)}`
          // Centred on the midpoint of the capitals' middle and the x-height band's, which mixed
          // lowercase reads as centred: the capitals a little above the pill's middle, the band a
          // little below it (to within the ink's overshoot, which a serif's canvas measure reads
          // as up to a pixel at 12px).
          expect(Math.abs(m.cap + m.xBand) / 2, where).toBeLessThanOrEqual(0.75)
          expect(m.xBand, where).toBeGreaterThan(-0.25)
          expect(m.xBand, where).toBeLessThanOrEqual(1.5)
          expect(m.height, where).toBeCloseTo(m.untrimmedHeight, 1)
          expect(Math.abs(m.mark), where).toBeLessThanOrEqual(0.5)
          // Clear of the end cap's curve at the start: about half the pill's height.
          expect(Math.abs(m.startRoom - m.height / 2), where).toBeLessThanOrEqual(1.5)
          // The button's room after it is the room above it: the end cap's own circle.
          expect(m.endRoom, where).toBeCloseTo(m.verticalRoom, 1)
        }
        sheet.remove()
      }
    }
  } finally {
    handle.dispose()
  }
})
