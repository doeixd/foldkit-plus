/**
 * The bar's fit to a touch phone, broken in turn: `pnpm mutate
 * examples/richtext-playground/test/formatBar.mutations.ts`.
 */
const tests = ['examples/richtext-playground/test/formatBar.touch.browser.test.ts']

export default [
  {
    name: 'the link stays in the compact bar, past what 360px holds at 44px each',
    edits: [{ file: '../src/view.ts', find: "{ low: 'link' },", replace: "'link'," }],
    tests,
  },
  {
    name: 'the style trigger keeps its word on a touch phone',
    edits: [
      {
        file: '../src/style.ts',
        find: `Style.nest(':where([data-item="style"]) > &', { display: 'none' }),`,
        replace: 'Style.self({}),',
      },
    ],
    tests,
  },
  {
    name: 'the export button is a 30px target under a finger',
    edits: [
      {
        file: '../src/style.ts',
        find: "target at 30px.\n    Style.at(\n      '@media (pointer: coarse)',\n      Style.self({ minBlockSize: '2.75rem', minInlineSize: '2.75rem' }),",
        replace:
          "target at 30px.\n    Style.at(\n      '@media (pointer: coarse)',\n      Style.self({}),",
      },
    ],
    tests,
  },
]
