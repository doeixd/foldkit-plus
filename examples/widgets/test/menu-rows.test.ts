// @vitest-environment jsdom

import * as UiMenu from '@foldkit/ui/menu'
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { Menu } from 'foldkit-mixins-ui'
import { Message, ROWS, initial, pickedRow, update, type Model } from '../src/menu-rows/app.js'
import { island } from '../src/menu-rows/island.js'
import { MenuRows } from '../src/menu-rows/view.js'

const got = (message: UiMenu.Message) =>
  Message.GotMenu({ message: Menu.Message.GotMenu({ message }) })

const opened = (at: number): Model =>
  update(initial, got(UiMenu.Message.Opened({ maybeActiveItemIndex: Option.some(at) }))).model

const picked = (value: string): Model => {
  const index = ROWS.findIndex(row => row.value === value)
  return update(opened(index), got(UiMenu.Message.SelectedItem({ index, item: value }))).model
}

describe('update', () => {
  it('starts with nothing picked', () => {
    expect(initial.picked).toEqual(Option.none())
  })

  it.each(ROWS.map(row => [row.value, row.label] as const))(
    'picking %s reports its value, whatever its label (%s)',
    (value, label) => {
      const model = picked(value)
      expect(model.picked).toEqual(Option.some(value))
      expect(Option.map(pickedRow(model), row => row.label)).toEqual(Option.some(label))
    },
  )

  it('tells the two rows labelled Copy apart', () => {
    const [first, second] = ROWS.filter(row => row.label === 'Copy')
    expect(first?.value).not.toBe(second?.value)
    expect(picked('copy-text').picked).not.toEqual(picked('copy-link').picked)
  })

  it('returns the Model it was given when the Menu changes nothing', () => {
    expect(update(initial, got(UiMenu.Message.Closed())).model).toBe(initial)
  })

  it('keeps the last pick while the menu opens again', () => {
    const model = picked('copy-link')
    expect(
      update(model, got(UiMenu.Message.Opened({ maybeActiveItemIndex: Option.none() }))).model
        .picked,
    ).toEqual(Option.some('copy-link'))
  })
})

describe('the drawn menu', () => {
  it('shows the pick as its value and its label', () => {
    Scene.scene(
      { update, view: MenuRows },
      Scene.given(picked('copy-link')),
      Scene.expect(Scene.text('Picked: copy-link (label Copy)')).toExist(),
    )
  })
})

describe('trace', () => {
  it('replays the section’s Messages', () => {
    expect(island.runDemo()).toEqual([
      'start: picked=none label=none open=false',
      'opened: picked=none label=none open=true',
      'picked the first Copy: picked=copy-text label=Copy open=false',
      'picked the second Copy: picked=copy-link label=Copy open=false',
    ])
  })
})
