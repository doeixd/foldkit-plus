/**
 * The transition of a Dialog's and a Sheet's backdrop and panel, read as
 * computed `transition-duration` (a longhand, so a shorthand beside it cannot
 * hide) in every state the animation states draw: at rest, entering
 * (`data-closed`), leaving (`data-leave`), stepped back (`data-covered`) and,
 * for a sheet, dragged. `motion: 'none'` stills all of them; the Sheet's own
 * `motion.sheet` token times the slide and its exit; reduced motion still
 * zeroes only what travels.
 */
import { Schema } from 'effect'
import { Dialog as UiDialog } from '@foldkit/ui'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cdp } from 'vitest/browser'
import * as Dialog from '../src/dialog.js'
import { DialogSlots } from '../src/dialog.js'
import { Dialog as DialogRecipe } from '../src/recipes/dialog.js'
import { open } from './sheetFixture.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard

beforeEach(() => {
  // The default theme's motion scale is half, so durations read as written only at one.
  document.documentElement.style.setProperty('--fk-knob-motion', '1')
})

afterEach(async () => {
  document.documentElement.style.removeProperty('--fk-knob-motion')
  document.documentElement.style.removeProperty('--fk-motion-sheet')
  document.documentElement.style.removeProperty('--fk-motion-sheet-exit')
  await cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  })
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const Model = Schema.Struct({ dialog: UiDialog.Model })
type Model = typeof Model.Type
interface Message {
  readonly _tag: 'Got'
  readonly message: UiDialog.Message
}
const got = (message: UiDialog.Message): Message => ({ _tag: 'Got', message })

/** An open Dialog of `selection`, whose panel and backdrop the test reads. */
const openDialog = async (selection: Parameters<typeof DialogRecipe>[0]) => {
  const style = Style.forSlots(DialogSlots)(DialogRecipe(selection))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('reset', Defaults.reset), L.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'dialog-motion'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { dialog: UiDialog.open(UiDialog.init({ id: 'motion' })).model } }),
      update: (model: Model, message: Message) => {
        const next = UiDialog.update(model.dialog, message.message)
        return { model: { dialog: next.model }, commands: mapMessages(next.commands, got) }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.submodel({
          slotId: model.dialog.id,
          model: model.dialog,
          view: UiDialog.view,
          viewInputs: {
            toView: Dialog.toView([style.mixin], { h }, dialog =>
              h.dialog(
                dialog.dialog,
                dialog.isVisible
                  ? [h.div(dialog.backdrop), h.div(dialog.panel, [h.h2(dialog.title, ['Terms'])])]
                  : [],
              ),
            ),
          },
          toParentMessage: got,
        }),
    }),
  )
  const panel = await vi.waitFor(() => {
    const found = document.getElementById('motion-panel')
    expect(found).not.toBeNull()
    return found!
  })
  return { panel, dispose: () => handle.dispose() }
}

/** The states a surface is drawn in, as the attributes `@foldkit/ui` puts on it. */
const states = {
  rest: [],
  entering: ['data-closed'],
  leaving: ['data-closed', 'data-leave'],
  covered: ['data-covered'],
  dragging: ['data-dragging'],
} as const

/** The `transition-duration` of `element` with `attributes` set, then put back. */
const durationIn = (element: Element, attributes: ReadonlyArray<string>): string => {
  const had = attributes.filter(name => element.hasAttribute(name))
  attributes.forEach(name => element.setAttribute(name, ''))
  const duration = getComputedStyle(element).transitionDuration
  attributes.filter(name => !had.includes(name)).forEach(name => element.removeAttribute(name))
  return duration
}

const read = (panel: Element, state: keyof typeof states) => ({
  panel: durationIn(panel, states[state]),
  backdrop: durationIn(panel.previousElementSibling!, states[state]),
})

const still = '0s'

test.each(Object.keys(states) as ReadonlyArray<keyof typeof states>)(
  'a dialog with motion none has no duration on its backdrop or panel: %s',
  async state => {
    const { panel, dispose } = await openDialog({ motion: 'none' })
    try {
      expect(read(panel, state)).toEqual({ panel: still, backdrop: still })
    } finally {
      dispose()
    }
  },
)

test('a dialog moves on the slow tier by default, and leaves on the quicker exit', async () => {
  const { panel, dispose } = await openDialog({})
  try {
    expect(read(panel, 'rest')).toEqual({
      panel: '0.24s, 0.24s, 0.24s',
      backdrop: '0.24s, 0.24s, 0.24s',
    })
    expect(read(panel, 'leaving')).toEqual({
      panel: '0.16s, 0.16s, 0.16s',
      backdrop: '0.16s, 0.16s, 0.16s',
    })
  } finally {
    dispose()
  }
})

test.each(Object.keys(states) as ReadonlyArray<keyof typeof states>)(
  'a sheet with motion none has no duration on its backdrop or panel: %s',
  async state => {
    const { panel, dispose } = await open({ side: 'right' }, { motion: 'none' })
    try {
      expect(read(panel, state)).toEqual({ panel: still, backdrop: still })
    } finally {
      dispose()
    }
  },
)

test('a sheet slides on motion.sheet and leaves on motion.sheet-exit, and a drag follows the pointer', async () => {
  document.documentElement.style.setProperty('--fk-motion-sheet', '500ms')
  document.documentElement.style.setProperty('--fk-motion-sheet-exit', '300ms')
  const { panel, dispose } = await open({ side: 'right' })
  try {
    expect(read(panel, 'rest')).toEqual({
      panel: '0.5s, 0.5s, 0.5s',
      backdrop: '0.5s, 0.5s, 0.5s',
    })
    expect(read(panel, 'entering')).toEqual({
      panel: '0.5s, 0.5s, 0.5s',
      backdrop: '0.5s, 0.5s, 0.5s',
    })
    expect(read(panel, 'leaving')).toEqual({
      panel: '0.3s, 0.3s, 0.3s',
      backdrop: '0.3s, 0.3s, 0.3s',
    })
    expect(read(panel, 'covered').panel).toBe('0.5s, 0.5s, 0.5s')
    // The page it steps back moves with the sheet.
    expect(getComputedStyle(document.getElementById('page')!).transitionDuration).toBe('0.5s')
    // Dragging stills the panel; its backdrop is no part of the drag.
    expect(read(panel, 'dragging').panel).toBe('0s')
  } finally {
    dispose()
  }
})

test('a sheet takes the slow tier when the theme sets no motion.sheet', async () => {
  const { panel, dispose } = await open({ side: 'right' })
  try {
    expect(read(panel, 'rest').panel).toBe('0.24s, 0.24s, 0.24s')
    expect(read(panel, 'leaving').panel).toBe('0.16s, 0.16s, 0.16s')
  } finally {
    dispose()
  }
})

test('under reduced motion a sheet keeps its fade and loses its travel, and motion none leaves that as it was', async () => {
  await cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  const moving = await open({ side: 'right' })
  try {
    expect(read(moving.panel, 'rest').panel).toBe('0.24s, 0s, 0s')
  } finally {
    moving.dispose()
  }
  const none = await open({ side: 'right' }, { motion: 'none' })
  try {
    expect(read(none.panel, 'rest').panel).toBe(still)
  } finally {
    none.dispose()
  }
})
