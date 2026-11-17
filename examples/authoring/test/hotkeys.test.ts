/**
 * The hotkeys section with no page: what each press and edit does to the Model,
 * the labels the history gives its buttons, and that the one pattern behind a
 * shortcut is what matches, what is shown and what `aria-keyshortcuts` says.
 */
import { Option } from 'effect'
import { Inert } from 'foldkit-mixins/testing'
import { ariaKeyshortcuts, formatHotkey } from 'foldkit-primitives/events'
import type { Platform } from 'foldkit-primitives/media'
import { describe, expect, it } from 'vitest'
import {
  Message,
  REDO,
  RENAME,
  UNDO,
  WITHIN_MS,
  chordOf,
  initialOf,
  redoLabel,
  titleOf,
  undoLabel,
  update,
  type Model,
} from '../src/hotkeys/app.js'
import { editorView } from '../src/hotkeys/view.js'
import { pageStylesheet } from '../src/style.js'

const press = (init: Partial<Parameters<typeof Message.Pressed>[0]> & { readonly key: string }) =>
  Message.Pressed({
    code: '',
    typing: false,
    repeat: false,
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    ...init,
  })

const run = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  messages.reduce((current, message) => update(current, message).model, model)

const windows = initialOf('windows').model

describe('the shortcuts', () => {
  it('are Control on Windows and Meta on a Mac, and only exactly the chord', () => {
    const rename = (platform: Platform, init: Parameters<typeof press>[0]) =>
      update(initialOf(platform).model, press(init)).model.history.present.label
    expect(rename('windows', { key: 'e', ctrl: true })).toBe('rename')
    expect(rename('mac', { key: 'e', meta: true })).toBe('rename')
    expect(rename('mac', { key: 'e', ctrl: true })).toBe('start')
    expect(rename('windows', { key: 'e', ctrl: true, shift: true })).toBe('start')
    expect(rename('windows', { key: 'e', ctrl: true, repeat: true })).toBe('start')
  })

  it('fire in a text field too, since they hold a command modifier', () => {
    expect(
      update(windows, press({ key: 'e', ctrl: true, typing: true })).model.history.present.label,
    ).toBe('rename')
  })

  it('answer undo, redo and rename, and nothing for another press', () => {
    const tags = (init: Parameters<typeof press>[0]) =>
      Option.match(chordOf('windows', press(init)), {
        onNone: () => 'none',
        onSome: message => message._tag,
      })
    expect(tags({ key: 'z', ctrl: true })).toBe('Undone')
    expect(tags({ key: 'z', ctrl: true, shift: true })).toBe('Redone')
    expect(tags({ key: 'e', ctrl: true })).toBe('Renamed')
    expect(tags({ key: 'z' })).toBe('none')
  })
})

describe.each(['windows', 'mac'] as const)('one pattern on %s', platform => {
  const model = initialOf(platform).model
  const buttons = Inert.bySlot(
    Inert.draw(
      editorView(() => 0),
      model,
    ),
    'action',
  )

  // What `aria-keyshortcuts` names is pressed back as a chord: the attribute is the shortcut.
  const chordFrom = (keys: string) => {
    const parts = keys.split('+')
    const key = parts.at(-1) ?? ''
    return press({
      key: key.toLowerCase(),
      ctrl: parts.includes('Control'),
      shift: parts.includes('Shift'),
      alt: parts.includes('Alt'),
      meta: parts.includes('Meta'),
    })
  }

  it.each([
    ['rename', RENAME, 0],
    ['undo', UNDO, 1],
    ['redo', REDO, 2],
  ] as const)(
    '%s: the button says what the pattern says, and that chord runs it',
    (_n, pattern, at) => {
      const button = buttons[at]!
      const aria = Inert.value(button, 'aria-keyshortcuts')
      expect(aria).toBe(Option.getOrThrow(ariaKeyshortcuts(pattern, platform)))
      const shown = Inert.text(button)
      expect(shown).toContain(Option.getOrThrow(formatHotkey(pattern, platform)))
      const chord = Option.getOrThrow(chordOf(platform, chordFrom(String(aria))))
      expect(chord._tag).toBe({ [RENAME]: 'Renamed', [UNDO]: 'Undone', [REDO]: 'Redone' }[pattern])
    },
  )
})

describe('the history', () => {
  it('names the step an undo takes back and the one a redo brings back', () => {
    expect(undoLabel(windows)).toBe('Undo')
    expect(redoLabel(windows)).toBe('Redo')
    const renamed = run(windows, Message.Renamed())
    expect(undoLabel(renamed)).toBe('Undo rename')
    const undone = run(renamed, Message.Undone())
    expect(undoLabel(undone)).toBe('Undo')
    expect(redoLabel(undone)).toBe('Redo rename')
    expect(titleOf(undone)).toBe('Untitled')
    expect(titleOf(run(undone, Message.Redone()))).toBe(titleOf(renamed))
  })

  it('undoes typing as one step until a pause, which ends it', () => {
    const steady = run(
      windows,
      Message.Typed({ text: 'a', at: 0 }),
      Message.Typed({ text: 'ab', at: WITHIN_MS - 1 }),
      Message.Typed({ text: 'abc', at: 2 * WITHIN_MS - 2 }),
    )
    expect(undoLabel(steady)).toBe('Undo typing')
    expect(titleOf(run(steady, Message.Undone()))).toBe('Untitled')

    const paused = run(
      windows,
      Message.Typed({ text: 'a', at: 0 }),
      Message.Typed({ text: 'ab', at: 10 }),
      Message.Typed({ text: 'abc', at: 10 + WITHIN_MS }),
    )
    expect(titleOf(run(paused, Message.Undone()))).toBe('ab')
    expect(titleOf(run(paused, Message.Undone(), Message.Undone()))).toBe('Untitled')
  })

  it('ends a typing step at a rename, and starts a new one after an undo', () => {
    const typed = run(windows, Message.Typed({ text: 'a', at: 0 }), Message.Renamed())
    expect(undoLabel(typed)).toBe('Undo rename')
    const back = run(typed, Message.Undone(), Message.Typed({ text: 'ax', at: 1 }))
    expect(titleOf(run(back, Message.Undone()))).toBe('a')
  })

  it('returns the Model it was given when nothing changes', () => {
    expect(update(windows, Message.Undone()).model).toBe(windows)
    expect(update(windows, Message.Redone()).model).toBe(windows)
    const typed = run(windows, Message.Typed({ text: 'a', at: 0 }))
    expect(update(typed, Message.Typed({ text: 'a', at: 5 })).model).toBe(typed)
    expect(update(typed, press({ key: 'q' })).model).toBe(typed)
  })
})

describe('the view', () => {
  const tree = Inert.draw(
    editorView(() => 0),
    windows,
  )

  it('draws only Slots and reads no missing token', () => {
    expect(Inert.unslotted(tree)).toEqual([])
    expect(Inert.fixedInline(tree)).toEqual([])
    expect(Inert.missingTokens(tree, pageStylesheet)).toEqual([])
  })

  it('stamps an edit with the clock it was given', () => {
    const message = update(windows, Message.Typed({ text: 'x', at: 7 })).model
    expect(message.history.groupedAt).toEqual(Option.some(7))
  })
})
