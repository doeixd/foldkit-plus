/**
 * The Builder's own look, broken in turn:
 * `pnpm mutate examples/cms/test/builderStyle.mutations.ts`.
 */
const tests = ['examples/cms/test/builder.browser.test.ts']
const style = '../src/styles/builderStyle.ts'

export default [
  {
    name: "the inspector's choices are only as wide as their options",
    edits: [
      {
        file: style,
        find: "choices: Recipes.Segmented({ tray: 'tray', width: 'fill' }).group",
        replace: "choices: Recipes.Segmented({ tray: 'tray' }).group",
      },
    ],
    tests,
  },
  {
    name: "the narrow editor's tabs are only as wide as their options",
    edits: [
      {
        file: style,
        find: "      Style.self({ inlineSize: 'auto' }),\n    ),\n    panelTab:",
        replace: '    ),\n    panelTab:',
      },
    ],
    tests,
  },
]
