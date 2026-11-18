/**
 * The command menu, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/command.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/command.ts'
const unit = 'packages/mixins-ui/test/command.test.ts'
const browser = 'packages/mixins-ui/test/command.browser.test.ts'
const recipe = '../src/recipes/command.ts'

export default [
  {
    name: 'a row matching one word of the query stays',
    edits: [{ file, find: 'words.every(word =>', replace: 'words.some(word =>' }],
    tests: [unit],
  },
  {
    name: 'the query keeps its case',
    edits: [
      {
        file,
        find: '  const words = query\n    .toLowerCase()\n',
        replace: '  const words = query\n',
      },
    ],
    tests: [unit],
  },
  {
    name: "a row's words keep their case",
    edits: [
      {
        file,
        find: "        .join(' ')\n        .toLowerCase()\n",
        replace: "        .join(' ')\n",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the keys step onto a disabled row',
    edits: [
      {
        file,
        find: 'group.items.filter(item => item.disabled !== true)',
        replace: 'group.items.filter(() => true)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the highlight stays on a row filtered away',
    edits: [
      {
        file,
        find: 'const active = Option.filter(options.active, value => enabled.some(item => item.value === value))',
        replace: 'const active = options.active',
      },
    ],
    tests: [unit],
  },
  {
    name: 'ArrowDown steps up',
    edits: [
      {
        file,
        find: 'Next: moves(() => step(1)),',
        replace: 'Next: moves(() => step(-1)),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the keys stop at the ends',
    edits: [
      {
        file,
        find: 'at((from + by + enabled.length) % enabled.length)',
        replace: 'at(Math.max(0, Math.min(from + by, enabled.length - 1)))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Enter runs nothing',
    edits: [
      {
        file,
        find: 'Run: ({ current }) => Option.map(current, options.onRun),',
        replace: 'Run: () => Option.none(),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'every row reads as selected',
    edits: [{ file, find: 'h.AriaSelected(on),', replace: 'h.AriaSelected(true),' }],
    tests: [unit],
  },
  {
    name: 'a disabled row runs when pressed',
    edits: [{ file, find: '...(disabled\n', replace: '...(false\n' }],
    tests: [unit],
  },
  {
    name: 'a row is not matched by its description',
    edits: [{ file, find: "item.description ?? '',", replace: '' }],
    tests: [unit],
  },
  {
    name: 'a shortcut is not named',
    edits: [
      {
        file,
        find: '[h.AriaKeyshortcuts(keyShortcuts(item.shortcut))]',
        replace: '[]',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Backspace never leaves a page',
    edits: [
      {
        file,
        find: 'Option.map(Option.fromNullishOr(options.page), page => page.onBack)',
        replace: 'Option.none()',
      },
    ],
    tests: [browser],
  },
  {
    name: 'Backspace leaves a page with words in the field',
    edits: [
      {
        file,
        find: 'Back: ({ query }) =>' + '\n' + "      query === ''",
        replace: 'Back: ({ query }) =>' + '\n' + "      query === '' || true",
      },
    ],
    tests: [browser],
  },
  {
    name: 'Backspace decides on the query the field was drawn with',
    edits: [
      {
        file,
        find: 'Back: ({ query }) =>' + '\n' + "      query === ''",
        replace: 'Back: () =>' + '\n' + "      options.query === ''",
      },
    ],
    tests: [browser],
  },
  {
    name: 'what is typed before the next frame is not kept for Backspace',
    edits: [{ file, find: '          reached.query = query\n', replace: '' }],
    tests: [browser],
  },
  {
    name: 'only ⌘K opens the menu',
    edits: [
      {
        file,
        find: "matchHotkey('meta+k', press) || matchHotkey('ctrl+k', press)",
        replace: "matchHotkey('meta+k', press)",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a loading list is not busy',
    edits: [{ file, find: '[h.AriaBusy(true)]', replace: '[]' }],
    tests: [browser],
  },
  {
    name: 'a loading list says nothing',
    edits: [
      {
        file,
        find: '[h.div(builders.loading.attrs(), [said.loading])]',
        replace: '[]',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the words given are not read',
    edits: [
      {
        file,
        find: 'const said = wordsOf(defaultWords, options.words)',
        replace: 'const said = defaultWords',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a hint draws no words',
    edits: [{ file, find: '[keys(hint.keys), hint.label]', replace: '[keys(hint.keys)]' }],
    tests: [browser],
  },
  {
    name: 'the card shrinks to its rows',
    edits: [{ file: recipe, find: "inlineSize: '32rem',", replace: "inlineSize: 'auto'," }],
    tests: [browser],
  },
  {
    name: 'a narrower parent does not cap the card',
    edits: [{ file: recipe, find: "maxInlineSize: '100%',", replace: '' }],
    tests: [browser],
  },
  {
    name: "the card's border lies outside its width",
    edits: [{ file: recipe, find: "boxSizing: 'border-box',", replace: '' }],
    tests: [browser],
  },
  {
    name: 'the field has no magnifier',
    edits: [{ file: recipe, find: "'--icon': ref.icon.search,", replace: '' }],
    tests: [browser],
  },
  {
    name: 'no hairline parts two groups',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo(':not(:first-child)', {",
        replace: "Style.pseudo(':not(*)', {",
      },
    ],
    tests: [browser],
  },
  {
    name: "the hairline stops at the list's padding",
    edits: [{ file: recipe, find: "marginInline: `calc(-1 * ${ref.space['2xs']})`,", replace: '' }],
    tests: [browser],
  },
  {
    name: 'PageDown wraps past the end',
    edits: [
      {
        file,
        find: 'Math.min(Math.max(positionOf() + by, 0), enabled.length - 1)',
        replace: '(positionOf() + by + enabled.length) % enabled.length',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the application routes are dropped',
    edits: [{ file, find: ', ...(options.routes ?? [])', replace: '' }],
    tests: [unit],
  },
  {
    name: 'keepActiveInView watches nothing',
    edits: [
      {
        file,
        find: `selector: '[role="option"][aria-selected="true"]'`,
        replace: `selector: '[data-nothing]'`,
      },
    ],
    tests: [browser],
  },
  {
    name: 'a key reads the highlight the last drawing showed, not where the previous key left it',
    edits: [{ file, find: '      reached.current = Option.some(value)\n', replace: '' }],
    tests: [browser],
  },
  {
    name: 'Home moves the highlight, not the caret',
    edits: [
      {
        file,
        find: "['PageDown', 'PageDown'],",
        replace: "['PageDown', 'PageDown'], ['First', 'Home'],",
      },
      {
        file,
        find: 'PageDown: moves(() => jump(PAGE)),',
        replace: 'PageDown: moves(() => jump(PAGE)), First: moves(() => at(0)),',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a Command preset is ignored',
    edits: [{ file, find: 'view(layered(config, options), h)', replace: 'view(options, h)' }],
    tests: [unit],
  },
]
