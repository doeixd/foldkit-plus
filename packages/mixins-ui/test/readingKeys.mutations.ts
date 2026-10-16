/**
 * Arrow keys in the reading direction, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/readingKeys.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/readingKeys.browser.test.ts']
const direction = '../src/direction.ts'

/** A component's `readingKeys` given a Mount that reads no key. */
const unread = (file: string) => ({
  name: `${file} reads its keys as upstream does`,
  edits: [
    {
      file,
      find: "import { ReadingKeys } from './direction.js'",
      replace: "import { FollowDirection, ReadingKeys } from './direction.js'",
    },
    { file, find: 'mount: () => ReadingKeys(),', replace: 'mount: () => FollowDirection(),' },
  ],
  tests,
})

export default [
  {
    name: 'no key is swapped',
    edits: [
      {
        file: direction,
        find: "if (key !== event.key) Object.defineProperty(event, 'key', { value: key })",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'every page reads as right to left',
    edits: [
      {
        file: direction,
        find: "element.matches(':dir(rtl)') ? 'rtl' : 'ltr'",
        replace: "'rtl' as 'ltr' | 'rtl'",
      },
    ],
    tests,
  },
  {
    name: 'tabs read their keys as upstream does',
    edits: [
      {
        file: '../src/tabs.ts',
        find: 'mount: () => ReadingKeys(),',
        replace: 'mount: () => FollowDirection(),',
      },
    ],
    tests,
  },
  unread('../src/radioGroup.ts'),
  unread('../src/calendar.ts'),
]
