/** The shortcut list is `formatHotkey`'s text for the viewer's platform. */
import { expect, test } from 'vitest'
import { shortcuts } from '../src/toolbarBody.js'

// \u2066 and \u2069 isolate each chord, so a right-to-left page does not reorder it.
const isolate = (text: string) => `\u2066${text}\u2069`

test.each([
  ['mac', isolate('⌘C'), isolate('⌘A')],
  ['windows', isolate('Ctrl+C'), isolate('Ctrl+A')],
] as const)(
  'on %s the copy and select-all chords are written as it writes them',
  (platform, copy, all) => {
    const keys = shortcuts(platform).map(row => row.keys)
    expect(keys).toContain(copy)
    expect(keys).toContain(all)
  },
)

test('every chord is one formatHotkey could read: none falls back to its pattern', () => {
  for (const row of shortcuts('windows')) expect(row.keys).not.toContain('Mod')
})
