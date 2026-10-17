/**
 * The chat message, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/chatMessage.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = ['packages/mixins-ui/test/chatMessage.test.ts']
const browser = ['packages/mixins-ui/test/chatMessage.browser.test.ts']
const view = '../src/chatMessage.ts'
const recipe = '../src/recipes/chatMessage.ts'

export default [
  {
    name: 'the body balances its lines as the reset does',
    edits: [
      {
        file: recipe,
        find: "h4, h5, h6)', { textWrap: 'wrap' }",
        replace: "h4, h5, h6)', { textWrap: 'pretty' }",
      },
    ],
    tests: browser,
  },
  {
    name: 'the body keeps the reset’s wrap (unit)',
    edits: [
      {
        file: recipe,
        find: "h4, h5, h6)', { textWrap: 'wrap' }",
        replace: "h4, h5, h6)', {}",
      },
    ],
    tests: unit,
  },
  {
    name: 'the user stands at the start',
    edits: [
      {
        file: recipe,
        find: "root: variant(Style.nest(user, { flexDirection: 'row-reverse' })),",
        replace: 'root: variant(Style.nest(user, {})),',
      },
    ],
    tests: browser,
  },
  {
    name: 'hover reveals no actions',
    edits: [
      {
        file: recipe,
        find: "Style.nest('[data-from]:is(:hover, :focus-within) &', { opacity: '1' }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'hidden actions take no room',
    edits: [
      {
        file: recipe,
        find: "...transition('opacity'),",
        replace: "position: 'absolute', visibility: 'hidden', ...transition('opacity'),",
      },
      {
        file: recipe,
        find: "Style.nest('[data-from]:is(:hover, :focus-within) &', { opacity: '1' }),",
        replace:
          "Style.nest('[data-from]:is(:hover, :focus-within) &', { opacity: '1', position: 'static', visibility: 'visible' }),",
      },
    ],
    tests: browser,
  },
  {
    name: 'a continued message sits as far as a new sender',
    edits: [
      {
        file: recipe,
        find: "Style.nest('& > [data-continued=\"true\"]', { marginBlockStart: ref.space['2xs'] }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a failed status reads as any other',
    edits: [{ file: recipe, find: '{ color: ref.error.ink }', replace: '{}' }],
    tests: browser,
  },
  {
    name: 'a retry is drawn whatever the status',
    edits: [
      {
        file: view,
        find: "status === 'failed' && onRetry !== undefined",
        replace: 'onRetry !== undefined',
      },
    ],
    tests: unit,
  },
  {
    name: 'a disabled action still sends',
    edits: [{ file: view, find: 'action.disabled === true', replace: 'false' }],
    tests: unit,
  },
  {
    name: 'a streaming message is not busy',
    edits: [{ file: view, find: '[h.AriaBusy(true)]', replace: '[]' }],
    tests: unit,
  },
  {
    name: 'any assistant continues another',
    edits: [{ file: view, find: ' && previous.author === next.author', replace: '' }],
    tests: unit,
  },
  {
    name: 'a continued message draws its picture again',
    edits: [{ file: view, find: 'continued ? [] : [options.avatar]', replace: '[options.avatar]' }],
    tests: unit,
  },
  {
    name: 'the status label is ignored',
    edits: [
      {
        file: view,
        find: 'options.statusLabel ?? statusWords[status]',
        replace: 'statusWords[status]',
      },
    ],
    tests: unit,
  },
  {
    name: 'actions are always pinned',
    edits: [
      {
        file: view,
        find: "h.DataAttribute('pinned', flag(options.pinActions))",
        replace: "h.DataAttribute('pinned', 'true')",
      },
    ],
    tests: unit,
  },
  {
    name: 'the time has no machine value',
    edits: [{ file: view, find: "[h.Attribute('datetime', time.at)]", replace: '[]' }],
    tests: unit,
  },
]
