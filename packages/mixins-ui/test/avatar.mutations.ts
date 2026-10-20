/**
 * The avatar, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/avatar.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = ['packages/mixins-ui/test/avatar.test.ts']
const browser = ['packages/mixins-ui/test/avatar.browser.test.ts']
const view = '../src/avatar.ts'
const recipe = '../src/recipes/avatar.ts'

export default [
  {
    name: 'widthOf reads a rem as 10 pixels',
    edits: [{ file: view, find: 'sizes[size] * 16', replace: 'sizes[size] * 10' }],
    tests: browser,
  },
  {
    name: 'a derived picture is drawn as its URL alone',
    edits: [
      {
        file: view,
        find: 'onSome: ({ img }) => [imgAttributes(img, h)] },',
        replace: 'onSome: ({ img }) => [[h.Src(img.src)]] },',
      },
    ],
    tests: unit,
  },
  {
    name: 'a picture the provider lacks draws an empty img',
    edits: [
      { file: view, find: '{ onNone: () => [], onSome', replace: '{ onNone: () => [[]], onSome' },
    ],
    tests: unit,
  },
  {
    name: 'initials take every name part',
    edits: [{ file: view, find: '.slice(0, 2)', replace: '.slice(0, 3)' }],
    tests: unit,
  },
  {
    name: 'pictures tile instead of covering',
    edits: [{ file: recipe, find: "objectFit: 'cover',", replace: "objectFit: 'fill'," }],
    tests: unit,
  },
  {
    name: 'a picture names the person again',
    edits: [{ file: view, find: "h.Alt('')", replace: 'h.Alt(options.name)' }],
    tests: unit,
  },
  {
    name: 'the status is not said',
    edits: [
      {
        file: view,
        find: 'h.AriaLabel(status === undefined ? options.name : `${options.name}, ${status}`),',
        replace: 'h.AriaLabel(options.name),',
      },
    ],
    tests: unit,
  },
  {
    name: 'every name has one hue',
    edits: [{ file: view, find: 'return hash % 360', replace: 'return 200' }],
    tests: unit,
  },
  {
    name: 'the group draws everyone past max',
    edits: [
      {
        file: view,
        find: 'const shown = options.people.slice(0, max)',
        replace: 'const shown = options.people',
      },
    ],
    tests: unit,
  },
  {
    name: 'max is not checked',
    edits: [
      { file: view, find: '  if (!Number.isInteger(max) || max < 1) {', replace: '  if (false) {' },
    ],
    tests: unit,
  },
  {
    name: 'the count is coloured by its words',
    edits: [
      {
        file: recipe,
        find: "Style.nest(':where(:not([data-rest])) > &', {",
        replace: "Style.nest(':where(*) > &', {",
      },
    ],
    tests: browser,
  },
  {
    name: 'initials ignore the name’s hue',
    edits: [
      {
        file: recipe,
        find: 'const byName = (from: string) => `oklch(from ${from} l c var(--fk-avatar-hue))`',
        replace: 'const byName = (from: string) => from',
      },
    ],
    tests: browser,
  },
  {
    name: 'a group does not overlap',
    edits: [
      {
        file: recipe,
        find: "root: variant(Style.nest('& > * + *', { marginInlineStart: `calc(-1 * ${ref.space.sm})` })),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the avatar clips its status dot',
    edits: [
      {
        file: recipe,
        find: "        position: 'relative',\n        flex: 'none',",
        replace: "        position: 'relative',\n        overflow: 'clip',\n        flex: 'none',",
      },
    ],
    tests: browser,
  },
  {
    name: 'the dot sits at the top',
    edits: [
      {
        file: recipe,
        find: "        insetBlockEnd: '0',\n        insetInlineEnd: '0',",
        replace: "        insetBlockStart: '0',\n        insetInlineEnd: '0',",
      },
    ],
    tests: browser,
  },
  {
    name: 'an online dot is grey',
    edits: [
      {
        file: recipe,
        find: '{ background: ref.success.default }',
        replace: '{ background: ref.outline.overt }',
      },
    ],
    tests: browser,
  },
  {
    name: 'the picture is round in a square avatar',
    edits: [
      {
        file: recipe,
        find: "        inlineSize: '100%',\n        blockSize: '100%',\n        borderRadius: 'inherit',\n        objectFit",
        replace:
          "        inlineSize: '100%',\n        blockSize: '100%',\n        borderRadius: '50%',\n        objectFit",
      },
    ],
    tests: browser,
  },
]
