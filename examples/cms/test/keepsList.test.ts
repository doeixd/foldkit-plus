// @vitest-environment jsdom
/**
 * Opening an entry from its list keeps the list drawn while the entry loads,
 * so the editor arrives whole; opened from an address, with no list to show,
 * the editor says it is loading.
 */
import { expect, it } from 'vitest'
import type { EditorStatus } from 'foldkit-cms'
import type { RemoteData } from 'foldkit-remote'
import { keepsList } from '../src/views/shell.js'

const rows: RemoteData<string> = { _tag: 'Ready', value: 'rows' }

it.each<[string, EditorStatus, RemoteData<string>, boolean]>([
  ['loading, with the list drawn', 'Loading', rows, true],
  ['loading, with the list refreshing', 'Loading', { _tag: 'Refreshing', value: 'rows' }, true],
  ['loading, opened from an address', 'Loading', { _tag: 'Initial' }, false],
  ['loading, with the list still loading', 'Loading', { _tag: 'Loading' }, false],
  [
    'loading, with a list that failed',
    'Loading',
    { _tag: 'Failed', error: { _tag: 'Boom', message: 'x' } },
    false,
  ],
  ['open, with the list drawn', 'Editing', rows, false],
  ['missing, with the list drawn', 'NotFound', rows, false],
])('%s', (_, status, list, kept) => {
  expect(keepsList(status, list)).toBe(kept)
})
