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
        find: "      Style.self({ inlineSize: 'auto' }),\n      // Under the page and its bar",
        replace: '      // Under the page and its bar',
      },
    ],
    tests,
  },
  {
    name: 'the narrow editor draws its page after the panel',
    edits: [
      {
        file: style,
        find: "Style.container(narrowBuilder, { gridArea: 'auto', order: '1' }),",
        replace: "Style.container(narrowBuilder, { gridArea: 'auto', order: '6' }),",
      },
    ],
    tests,
  },
  {
    name: 'the narrow editor draws its tabs before the page',
    edits: [
      {
        file: style,
        find: "marginBlockStart: t.space.sm, order: '3' }),",
        replace: "marginBlockStart: t.space.sm, order: '0' }),",
      },
    ],
    tests,
  },
  {
    name: 'the narrow editor keeps its regions a box, which holds its panel above the tabs',
    edits: [
      {
        file: style,
        find: "Style.container(narrowBuilder, { display: 'contents' }),",
        replace: "Style.container(narrowBuilder, { height: 'auto' }),",
      },
    ],
    tests,
  },
]
