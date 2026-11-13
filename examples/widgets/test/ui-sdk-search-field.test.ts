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
