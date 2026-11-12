/**
 * The Live badge's tint mixed in OKLCH again:
 * `pnpm mutate examples/cms/test/successTint.mutations.ts`.
 */
export default [
  {
    name: 'the success tint mixed in OKLCH, where the page’s grey brings its hue',
    edits: [
      {
        file: '../src/styles/adminStyle.ts',
        find: 'background: `color-mix(in oklab, ${t.success.default} 14%, ${t.surface.base})`',
        replace: 'background: `color-mix(in oklch, ${t.success.default} 14%, ${t.surface.base})`',
      },
    ],
    tests: ['examples/cms/test/successTint.browser.test.ts'],
  },
]
