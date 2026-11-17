/**
 * The sections whose code loads when they near the window: the ones the
 * showcase began with, then those added for later capabilities. Each names its
 * folder's `island.ts`, which exports `island`: the section's trace, sheet and
 * boot. Adding one means adding a line here, beside its folder and tests.
 */
import type { LazyIsland } from './island.js'

export const earlierIslands: ReadonlyArray<LazyIsland> = [
  {
    id: 'toggle',
    title: 'Toggle',
    load: () => import('./toggle/island.js').then(module => module.island),
  },
  {
    id: 'toggle-group',
    title: 'Toggle group',
    load: () => import('./toggle-group/island.js').then(module => module.island),
  },
  {
    id: 'accordion',
    title: 'Accordion',
    load: () => import('./accordion/island.js').then(module => module.island),
  },
  {
    id: 'alert-dialog',
    title: 'Alert dialog',
    load: () => import('./alert-dialog/island.js').then(module => module.island),
  },
  {
    id: 'autocomplete',
    title: 'Autocomplete',
    load: () => import('./autocomplete/island.js').then(module => module.island),
  },
  {
    id: 'number-field',
    title: 'Number field',
    load: () => import('./number-field/island.js').then(module => module.island),
  },
  {
    id: 'otp-field',
    title: 'One-time code',
    load: () => import('./otp-field/island.js').then(module => module.island),
  },
  {
    id: 'palette',
    title: 'Command palette',
    load: () => import('./palette/island.js').then(module => module.island),
  },
  {
    id: 'checkbox-group',
    title: 'Checkbox group',
    load: () => import('./checkbox-group/island.js').then(module => module.island),
  },
  {
    id: 'meter',
    title: 'Meter',
    load: () => import('./meter/island.js').then(module => module.island),
  },
  {
    id: 'progress',
    title: 'Progress',
    load: () => import('./progress/island.js').then(module => module.island),
  },
  {
    id: 'command',
    title: 'Command',
    load: () => import('./command/island.js').then(module => module.island),
  },
  {
    id: 'context-menu',
    title: 'Context menu',
    load: () => import('./context-menu/island.js').then(module => module.island),
  },
  {
    id: 'hover-card',
    title: 'Hover card',
    load: () => import('./hover-card/island.js').then(module => module.island),
  },
  {
    id: 'menubar',
    title: 'Menu bar',
    load: () => import('./menubar/island.js').then(module => module.island),
  },
  {
    id: 'native-select',
    title: 'Native select',
    load: () => import('./native-select/island.js').then(module => module.island),
  },
  {
    id: 'navigation-menu',
    title: 'Navigation menu',
    load: () => import('./navigation-menu/island.js').then(module => module.island),
  },
  {
    id: 'sidebar',
    title: 'Sidebar',
    load: () => import('./sidebar/island.js').then(module => module.island),
  },
  {
    id: 'resizable',
    title: 'Resizable',
    load: () => import('./resizable/island.js').then(module => module.island),
  },
  {
    id: 'picker',
    title: 'Picker (a dropdown, and a sheet on a phone)',
    load: () => import('./picker/island.js').then(module => module.island),
  },
  {
    id: 'search-field',
    title: 'Search field (placed twice)',
    load: () => import('./search-field/island.js').then(module => module.island),
  },
]

export const newerIslands: ReadonlyArray<LazyIsland> = [
  {
    id: 'file-input',
    title: 'File input in a form',
    load: () => import('./file-input/island.js').then(module => module.island),
  },
  {
    id: 'file-upload',
    title: 'File upload in a form',
    load: () => import('./file-upload/island.js').then(module => module.island),
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

export const lazyIslands: ReadonlyArray<LazyIsland> = [...earlierIslands, ...newerIslands]
