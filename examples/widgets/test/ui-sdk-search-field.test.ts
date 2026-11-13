import { Scene } from 'foldkit/test'
import { test } from 'vitest'
import { initial, update, view } from '../src/ui-sdk-search-field.js'

test('typing and clearing one search leaves the other search intact', () => {
  Scene.scene(
    { update, view },
    Scene.given(initial),
    Scene.type('#first input', 'alpha'),
    Scene.type('#second input', 'beta'),
    Scene.expect(Scene.selector('#first input')).toHaveValue('alpha'),
    Scene.expect(Scene.selector('#second input')).toHaveValue('beta'),
    Scene.click('#first button'),
    Scene.expect(Scene.selector('#first input')).toHaveValue(''),
    Scene.expect(Scene.selector('#second input')).toHaveValue('beta'),
  )
})

test('a key gesture changes only the placement it is pressed in', () => {
  Scene.scene(
    { update, view },
    Scene.given(initial),
    Scene.type('#first input', 'alpha'),
    Scene.type('#second input', 'beta'),
    Scene.keydown('#first input', 'ArrowDown'),
    Scene.expect(Scene.selector('#first-search-results')).toExist(),
    Scene.expect(Scene.selector('#second-search-results')).not.toExist(),
    Scene.keydown('#first input', 'Escape'),
    Scene.expect(Scene.selector('#first input')).toHaveValue(''),
    Scene.expect(Scene.selector('#first-search-results')).not.toExist(),
    Scene.expect(Scene.selector('#second input')).toHaveValue('beta'),
  )
})
