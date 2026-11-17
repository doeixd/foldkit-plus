// @vitest-environment jsdom

import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { Menubar } from 'foldkit-mixins-ui'
import { Message, MENUS, initial, stopOf, update } from '../src/app-keys/app.js'
import { island } from '../src/app-keys/island.js'
import { AppKeys, clashes } from '../src/app-keys/view.js'

const field = Scene.role('combobox')

describe('update', () => {
  it.each([
    ['the query it already holds', Message.Queried({ query: '' })],
    ['a clear of an empty field', Message.ClearedQuery()],
    [
      'a bar Message that changes nothing',
      Message.GotBar({ message: Menubar.Message.CompletedFocusTrigger() }),
    ],
  ])('returns the Model it was given for %s', (_, message) => {
    expect(update(initial, message).model).toBe(initial)
  })

  it('keeps what the Command reports', () => {
    const typed = update(initial, Message.Queried({ query: 'sa' })).model
    expect(typed.query).toBe('sa')
    const moved = update(typed, Message.Moved({ value: 'save-file' })).model
    expect(moved.active).toEqual(Option.some('save-file'))
    expect(update(moved, Message.Moved({ value: 'save-file' })).model).toBe(moved)
    expect(update(moved, Message.Ran({ value: 'save-file' })).model.ran).toEqual(
      Option.some('save-file'),
    )
    expect(update(moved, Message.ClearedQuery()).model.query).toBe('')
  })

  it('moves the bar tab stop on its own Message, and keeps a row the bar reports chosen', () => {
    const last = update(
      initial,
      Message.GotBar({ message: Menubar.Message.Pressed({ key: 'End' }) }),
    )
    expect(stopOf(last.model)).toBe(MENUS.at(-1)?.label)
    expect(last.commands).toHaveLength(1)
    const chose = update(
      initial,
      Message.GotBar({ message: Menubar.Message.ChoseCheck({ menu: 0, value: 'Save' }) }),
    ).model
    expect(chose.chose).toEqual(Option.some('Save'))
    // A later Message with no row leaves the last choice standing.
    expect(
      update(chose, Message.GotBar({ message: Menubar.Message.Pressed({ key: 'End' }) })).model
        .chose,
    ).toEqual(Option.some('Save'))
  })
})

describe('the Command', () => {
  it('answers the application’s Escape only while the field holds words', () => {
    Scene.scene(
      { update, view: AppKeys },
      Scene.given(initial),
      Scene.type(field, 'sa'),
      Scene.expect(field).toHaveValue('sa'),
      Scene.keydown(field, 'Escape'),
      Scene.expect(field).toHaveValue(''),
      Scene.keydown(field, 'Escape'),
      Scene.expectIgnored(),
    )
  })

  it('moves the highlight to the last row the query leaves on End, beside its own arrows', () => {
    Scene.scene(
      { update, view: AppKeys },
      Scene.given(initial),
      Scene.keydown(field, 'End'),
      Scene.expect(field).toHaveAttr('aria-activedescendant', 'keys-command-delete'),
      Scene.keydown(field, 'ArrowDown'),
      Scene.expect(field).toHaveAttr('aria-activedescendant', 'keys-command-open-file'),
    )
  })

  it('takes End from the narrowed rows', () => {
    Scene.scene(
      { update, view: AppKeys },
      Scene.given(initial),
      Scene.type(field, 'file'),
      Scene.keydown(field, 'End'),
      Scene.expect(field).toHaveAttr('aria-activedescendant', 'keys-command-save-file'),
    )
  })
})

describe('the refused routes', () => {
  it('names the key, the widget’s own route and the application’s, for each widget', () => {
    expect(clashes).toHaveLength(2)
    expect(clashes[0]).toMatch(/^mixins:key-conflict: .*"ArrowDown".*"Next" and "Down again"/)
    expect(clashes[1]).toMatch(/^mixins:key-conflict: .*"Home".*"Menubar Home" and "Home again"/)
  })

  it('draws each refusal as text', () => {
    Scene.scene(
      { update, view: AppKeys },
      Scene.given(initial),
      ...clashes.map(text => Scene.expect(Scene.text(text)).toExist()),
    )
  })
})

describe('trace', () => {
  it('replays the section’s Messages', () => {
    expect(island.runDemo()).toEqual([
      'start: query="" active=none ran=none stop=File',
      'typed file: query="file" active=none ran=none stop=File',
      'ran save-file: query="file" active=save-file ran=save-file stop=File',
      'Escape: query="" active=save-file ran=save-file stop=File',
      'PageDown on the bar: query="" active=save-file ran=save-file stop=View',
    ])
  })
})
