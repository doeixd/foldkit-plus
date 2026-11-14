/**
 * The search field, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/searchField.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/searchField.test.ts'
const browser = 'packages/mixins-ui/test/searchField.browser.test.ts'
const ssr = 'packages/mixins-ui/test/searchField.ssr.test.ts'
const source = '../src/searchField.ts'
const recipe = '../src/recipes/searchField.ts'

export default [
  {
    name: 'the input is a plain text box, not a search box',
    edits: [{ file: source, find: "h.Type('search')", replace: "h.Type('text')" }],
    tests: [unit, ssr],
  },
  {
    name: 'the clear button is drawn on an empty field',
    edits: [
      {
        file: source,
        find: "options.value === '' || disabled",
        replace: 'disabled',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the clear button is drawn on a disabled field',
    edits: [
      {
        file: source,
        find: "options.value === '' || disabled",
        replace: "options.value === ''",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the clear button sends nothing',
    edits: [{ file: source, find: 'h.OnClick(options.onClear),', replace: '' }],
    tests: [unit],
  },
  {
    name: 'the clear button has no name',
    edits: [
      {
        file: source,
        find: "h.AriaLabel(options.words?.clear ?? 'Clear search'),",
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the words given for the clear button are ignored',
    edits: [
      {
        file: source,
        find: "options.words?.clear ?? 'Clear search'",
        replace: "'Clear search'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'Escape clears an empty field and consumes the key',
    edits: [
      {
        file: source,
        find: "value === '' ? Option.none() : Option.some(options.onClear)",
        replace: 'Option.some(options.onClear)',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'Escape never clears',
    edits: [
      {
        file: source,
        find: "value === '' ? Option.none() : Option.some(options.onClear)",
        replace: 'Option.none()',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: "the application's routes are dropped",
    edits: [{ file: source, find: '...(options.routes ?? []),', replace: '' }],
    tests: [unit],
  },
  {
    name: 'a disabled field still sends its text',
    edits: [
      {
        file: source,
        find: '...(disabled ? [h.Disabled(true)] : [onInputOf(h, options.onInput)]),',
        replace: '...(disabled ? [h.Disabled(true)] : []), onInputOf(h, options.onInput),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a disabled field still answers keys',
    edits: [
      {
        file: source,
        find: '...(disabled ? [] : [keys.mixin]),',
        replace: '...[keys.mixin],',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Focus looks for the wrong element',
    edits: [
      {
        file: source,
        find: 'Dom.focus(`#${inputId(id)}`)',
        replace: 'Dom.focus(`#${id}`)',
      },
    ],
    tests: [browser],
  },
  {
    name: "the browser's own cancel button stays drawn",
    edits: [
      {
        file: recipe,
        find: "Style.pseudo('::-webkit-search-cancel-button', { appearance: 'none', display: 'none' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the clear button sits at the right in a right-to-left page',
    edits: [{ file: recipe, find: "insetInlineEnd: '0',", replace: "right: '0'," }],
    tests: [browser],
  },
  {
    name: 'the input draws no focus ring',
    edits: [
      {
        file: recipe,
        find: '    input: [\n      control,',
        replace:
          "    input: [\n      control,\n      variant(Style.pseudo(':focus-visible', { outline: 'none' })),",
      },
    ],
    tests: [browser],
  },
]
