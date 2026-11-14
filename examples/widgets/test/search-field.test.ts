import { Command } from 'foldkit/scene'
import { Scene } from 'foldkit/test'
import { SearchField } from 'foldkit-mixins-ui'
import { test } from 'vitest'
import { initial, update } from '../src/search-field/app.js'
import { SearchFieldIsland } from '../src/search-field/demo.js'

const first = Scene.label('Search first')
const second = Scene.label('Search second')
const opened = (id: string) => Scene.selector(`#${id}-results`)

test('typing and clearing one search leaves the other search intact', () => {
  Scene.scene(
    { update, view: SearchFieldIsland },
    Scene.given(initial),
    Scene.type(first, 'alpha'),
    Scene.type(second, 'beta'),
    Scene.expect(first).toHaveValue('alpha'),
    Scene.expect(second).toHaveValue('beta'),
    Scene.click(Scene.selector('#first-clear')),
    Command.expectExact(SearchField.Focus({ id: 'first' })),
    Command.resolve(SearchField.Focus, SearchField.Message.CompletedFocus()),
    Scene.expect(first).toHaveValue(''),
    Scene.expect(second).toHaveValue('beta'),
  )
})

test('a key gesture changes only the placement it is pressed in', () => {
  Scene.scene(
    { update, view: SearchFieldIsland },
    Scene.given(initial),
    Scene.type(first, 'alpha'),
    Scene.type(second, 'beta'),
    Scene.keydown(first, 'ArrowDown'),
    Scene.expect(opened('first')).toExist(),
    Scene.expect(opened('second')).not.toExist(),
    Scene.keydown(first, 'Escape'),
    Command.expectExact(SearchField.Focus({ id: 'first' })),
    Command.resolve(SearchField.Focus, SearchField.Message.CompletedFocus()),
    Scene.expect(first).toHaveValue(''),
    Scene.expect(opened('first')).not.toExist(),
    Scene.expect(second).toHaveValue('beta'),
  )
})
