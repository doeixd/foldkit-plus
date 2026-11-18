/**
 * The site's chrome, broken in turn: `pnpm mutate examples/site/test/chrome.mutations.ts`.
 */
const file = '../src/style.ts'

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
]
