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
    edits: [{ file: source, find: 'h.OnClick(clear.onClear),', replace: '' }],
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
        find: "words === '' ? Option.none() : Option.some(clear.onClear)",
        replace: 'Option.some(clear.onClear)',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'Escape never clears',
    edits: [
      {
        file: source,
        find: "words === '' ? Option.none() : Option.some(clear.onClear)",
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
    edits: [
      {
        file: recipe,
        find: "root: component(Style.self({ display: 'block' })),",
        replace: "root: component(Style.self({ display: 'block', direction: 'ltr' })),",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the field draws no focus ring',
    edits: [
      {
        file: '../src/recipes/field.ts',
        find: '    focusWithin,\n    Style.pseudo(\':has([aria-invalid="true"])\'',
        replace: '    Style.pseudo(\':has([aria-invalid="true"])\'',
      },
    ],
    tests: [browser],
  },
  {
    name: "the application's clear content is dropped",
    edits: [
      {
        file: source,
        find: 'clear.content === undefined ? [] : [clear.content],',
        replace: '[],',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a clear button with content is not marked',
    edits: [
      {
        file: source,
        find: "...(clear.content === undefined ? [] : [h.DataAttribute('content', '')]),",
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a busy field says nothing',
    edits: [
      { file: source, find: '...(options.busy === true ? [h.AriaBusy(true)] : []),', replace: '' },
    ],
    tests: [unit],
  },
  {
    name: 'the end drawing is dropped',
    edits: [
      {
        file: source,
        find: '...(options.end === undefined ? [] : [h.span(builders.end.attrs(), [options.end])]),',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the clear button covers the text instead of sitting beside it',
    edits: [
      {
        file: recipe,
        find: "        alignSelf: 'stretch',\n        inlineSize: ladder('height'),",
        replace:
          "        alignSelf: 'stretch',\n        position: 'absolute',\n        inlineSize: ladder('height'),",
      },
    ],
    tests: [browser],
  },
]
