/**
 * The site's chrome, broken in turn: `pnpm mutate examples/site/test/chrome.mutations.ts`.
 */
const file = '../src/style.ts'
const nav = 'examples/site/test/navLinks.browser.test.ts'

export default [
  {
    name: 'the site theme keeps the shipped surface contrast',
    edits: [
      {
        file,
        find: 'surface: { lightness: { light: 100, dark: 14 }, contrast: 30 },',
        replace: 'surface: { lightness: { light: 100, dark: 14 }, contrast: 100 },',
      },
    ],
    tests: ['examples/site/test/codeSurface.browser.test.ts'],
  },
  {
    name: 'the first line has no room kept for the Copy button',
    edits: [
      {
        file,
        find: "Style.nest('&:first-child', { paddingInlineEnd: COPY_ROOM }),",
        replace: "Style.nest('&:first-child', { paddingInlineEnd: '0' }),",
      },
    ],
    tests: ['examples/site/test/codeSurface.browser.test.ts'],
  },
  {
    name: 'the header band is back above the code',
    edits: [
      {
        file,
        find: "      position: 'absolute',\n      insetBlockStart: t.space.xs,",
        replace: "      position: 'static',\n      insetBlockStart: t.space.xs,",
      },
    ],
    tests: ['examples/site/test/codeSurface.browser.test.ts'],
  },
  {
    name: 'the Copy button shows at rest',
    edits: [
      {
        file,
        find: "Style.nest(':where(:not(:hover, :focus-within)) > &', { opacity: '0' }),",
        replace: '',
      },
    ],
    tests: ['examples/site/test/codeSurface.browser.test.ts'],
  },
  {
    name: 'a code block is filled with the muted step',
    edits: [
      {
        file,
        find: 'const codeSurface = `color-mix(in oklab, ${t.surface.subtle} 70%, ${t.surface.base})`',
        replace: 'const codeSurface = t.surface.muted',
      },
    ],
    tests: ['examples/site/test/codeSurface.browser.test.ts'],
  },
  {
    name: 'the Copy button lies over the first line on a touch screen',
    edits: [
      {
        file,
        find: "Style.self({ position: 'static', justifyContent: 'flex-end' }),",
        replace: 'Style.self({}),',
      },
    ],
    tests: ['examples/site/test/codeSurface.touch.browser.test.ts'],
  },
  {
    name: 'the current page is not marked in a navigation list',
    edits: [
      {
        file,
        find: 'Style.nest(`${selector}[aria-current]`, {',
        replace: "Style.nest(`${selector}[aria-current='never']`, {",
      },
    ],
    tests: [nav],
  },
  {
    name: 'the places of the rail have a link style of their own',
    edits: [
      {
        file,
        find: "nav: [{ display: 'flex', flexDirection: 'column' }, navLink('a')],",
        replace: "nav: [{ display: 'flex', flexDirection: 'column' }],",
      },
    ],
    tests: [nav],
  },
  {
    name: 'the outline has a link style of its own',
    edits: [
      {
        file,
        find: "      navLink('a'),\n      Style.nest('.depth-3 a'",
        replace: "      Style.nest('.depth-3 a'",
      },
    ],
    tests: [nav],
  },
  {
    name: 'a link under the pointer shows no bar',
    edits: [
      {
        file,
        find: '      borderInlineStartColor: t.outline.default,\n',
        replace: '',
      },
    ],
    tests: [nav],
  },
  {
    name: 'a navigation link is the faint grey, under AA',
    edits: [
      {
        file,
        find: "      color: t.text.muted,\n      textDecoration: 'none',\n      fontSize: '0.875rem',",
        replace:
          "      color: t.site.faint,\n      textDecoration: 'none',\n      fontSize: '0.875rem',",
      },
    ],
    tests: [nav],
  },
]
