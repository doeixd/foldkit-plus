/**
 * The sections whose code loads when they near the window. Each names its
 * folder's `island.ts`, which exports `island`: the section's trace, sheet and
 * boot. Adding one means adding a line here, beside its folder and tests.
 */
import type { LazyIsland } from './island.js'

export const lazyIslands: ReadonlyArray<LazyIsland> = [
  {
    id: 'file-input',
    title: 'File input in a form',
    load: () => import('./file-input/island.js').then(module => module.island),
  },
  {
    id: 'tags-input',
    title: 'Tags input in a form',
    load: () => import('./tags-input/island.js').then(module => module.island),
  },
  {
    id: 'app-keys',
    title: 'Application keys on shipped widgets',
    load: () => import('./app-keys/island.js').then(module => module.island),
  },
  {
    id: 'menu-rows',
    title: 'Menu rows with a value, an icon and a hint',
    load: () => import('./menu-rows/island.js').then(module => module.island),
  },
  {
    id: 'choices',
    title: 'Segmented choices and a slider',
    load: () => import('./choices/island.js').then(module => module.island),
  },
  {
    id: 'table',
    title: 'Table with a row header and markup cells',
    load: () => import('./table/island.js').then(module => module.island),
  },
  {
    id: 'sheet',
    title: 'Sheet with snap points',
    load: () => import('./sheet/island.js').then(module => module.island),
  },
  {
    id: 'focus-kept',
    title: 'Focus kept when rows and toasts go',
    load: () => import('./focus-kept/island.js').then(module => module.island),
  },
  {
    id: 'tour',
    title: 'Tour and floating panel return focus',
    load: () => import('./tour/island.js').then(module => module.island),
  },
]
