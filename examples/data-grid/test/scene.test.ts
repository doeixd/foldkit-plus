/**
 * The registry page in Scene: the grid's Mounts resolved as the runtime
 * answers them, then the keyboard moving through the products.
 */
import { Scene } from 'foldkit/test'
import { GridFocus } from 'foldkit-data-grid'
import { DataGridView } from 'foldkit-mixins-data-grid'
import { test } from 'vitest'

import { Grid, Message, init, update, view } from '../src/main.js'

const grid = Scene.role('grid')

test('the registry page draws in Scene and moves through its products', () => {
  Scene.scene(
    { update, view },
    Scene.given(init(50).model),
    Scene.Mount.resolveAll(
      ...DataGridView<Message>().resolveMounts(Grid, {
        wrap: message => Message.GotGridMessage({ message }),
        viewport: { top: 0, left: 0, width: 1000, height: 356 },
      }),
    ),
    Scene.expect(grid).toHaveAttr('aria-rowcount', '51'),
    Scene.keydown(grid, 'ArrowDown'),
    Scene.keydown(grid, 'ArrowRight'),
    Scene.expect(grid).toHaveAttr(
      'aria-activedescendant',
      GridFocus.cellId('products', { row: 'p1', column: 'description' }),
    ),
  )
})
