/**
 * The avatar, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/avatar.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = ['packages/mixins-ui/test/avatar.test.ts']
const browser = ['packages/mixins-ui/test/avatar.browser.test.ts']
const view = '../src/avatar.ts'
const picture = '../src/avatar/picture.ts'
const recipe = '../src/recipes/avatar.ts'

export default [
  {
    name: 'the initials are upper-cased in the runtime’s locale',
    edits: [{ file: view, find: '.toUpperCase()', replace: '.toLocaleUpperCase()' }],
    tests: unit,
  },
  {
    name: 'widthOf reads a rem as 10 pixels',
    edits: [{ file: view, find: 'sizes[size] * 16', replace: 'sizes[size] * 10' }],
    tests: browser,
  },
  {
    name: 'a derived picture is drawn as its URL alone',
    edits: [
      {
        file: picture,
        find: '({ img }) => imgAttributes(img, h),',
        replace: '({ img }) => [h.Src(img.src)],',
      },
    ],
    tests: unit,
  },
  {
    name: 'a picture the provider lacks draws an empty img',
    edits: [{ file: view, find: 'onNone: () => [],', replace: 'onNone: () => [[]],' }],
    tests: unit,
  },
  {
    name: 'the count ignores words',
    edits: [
      {
        file: view,
        find: 'fill(wordsOf(words, options.words).more, { count: rest })',
        replace: 'fill(words.more, { count: rest })',
      },
    ],
    tests: unit,
  },
  {
    name: 'the group does not wrap its avatars',
    edits: [{ file: view, find: 'around(view({', replace: '(view({' }],
    tests: unit,
  },
  {
    name: 'a preset’s style does not reach a group’s avatars',
    edits: [
      {
        file: view,
        find: '...(preset.style === undefined ? {} : { avatarStyle: preset.style }),',
        replace: '',
      },
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
        find: '...(status === undefined ? [] : [status]),',
        replace: '',
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
  {
    name: 'a badge is announced on its own',
    edits: [
      {
        file: view,
        find: "h.DataAttribute('place', badge.place), h.AriaHidden(true)",
        replace: "h.DataAttribute('place', badge.place)",
      },
    ],
    tests: unit,
  },
  {
    name: 'a badge’s label is left out of the name',
    edits: [
      {
        file: view,
        find: '...badges.flatMap(badge => (badge.label === undefined ? [] : [badge.label])),',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'the count’s disc ignores `rest`',
    edits: [{ file: view, find: 'options.rest?.(rest),', replace: '' }],
    tests: unit,
  },
  {
    name: 'the top end badge sits at the bottom',
    edits: [
      {
        file: recipe,
        find: "'&[data-place=\"top-end\"]', { insetBlockStart: '0', insetInlineEnd: '0' }",
        replace: "'&[data-place=\"top-end\"]', { insetBlockEnd: '0', insetInlineEnd: '0' }",
      },
    ],
    tests: browser,
  },
  {
    name: 'a badge takes no room of its own',
    edits: [
      {
        file: recipe,
        find: "minInlineSize: '28%',\n        minBlockSize: '28%',",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a lifted group never raises',
    edits: [{ file: recipe, find: "'& > *:hover', {", replace: "'& > *:active', {" }],
    tests: browser,
  },
]
