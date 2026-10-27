/**
 * Mermaid fences drawn as diagrams, broken in turn:
 * `pnpm mutate examples/site/test/diagram.mutations.ts`.
 */
const tests = ['examples/site/test/diagram.test.ts']

export default [
  {
    name: 'a Mermaid fence drawn as code',
    edits: [
      { file: '../src/content/render.ts', find: "node.lang === 'mermaid'", replace: 'false' },
    ],
    tests,
  },
  {
    name: 'a fence Pele cannot read fails the build',
    edits: [
      {
        file: '../src/content/diagram.ts',
        find: 'Option.liftThrowable(render)(source)',
        replace: 'Option.some(render(source))',
      },
    ],
    tests,
  },
  {
    name: 'a diagram without its width, shrunk past reading',
    edits: [
      {
        file: '../src/content/render.ts',
        find: "ih.Attribute('style', `--diagram-width: ${width}px`)",
        replace: "ih.Attribute('data-width', '')",
      },
    ],
    tests,
  },
  {
    name: 'a diagram without its source',
    edits: [
      {
        file: '../src/content/render.ts',
        find: "[drawn, ih.details([], [ih.summary([], ['Diagram source']), fence])]",
        replace: '[drawn]',
      },
    ],
    tests,
  },
]
