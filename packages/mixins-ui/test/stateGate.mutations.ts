/**
 * The recipes' state gate (`recipes.test.ts`, "draws its hovers from the
 * state tokens"), shown to catch the hovers it was written for:
 * `pnpm mutate packages/mixins-ui/test/stateGate.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/recipes.test.ts']

export default [
  {
    name: 'Table’s fluid highlight paints with the text alone, as it did',
    edits: [
      {
        file: '../src/recipes/table.ts',
        find: '        borderRadius: ref.radius.md,\n        background: unfilledHover,',
        replace: '        borderRadius: ref.radius.md,\n        background: ref.state.hover,',
      },
    ],
    tests,
  },
  {
    name: 'a filled Segmented’s highlight is the accent’s, as it was',
    edits: [
      {
        file: '../src/recipes/segmented.ts',
        find: "        background: unfilledHover,\n        opacity: 'var(--fk-segmented-hover-shown)',",
        replace:
          "        background: ref.accent.subtle,\n        opacity: 'var(--fk-segmented-hover-shown)',",
      },
    ],
    tests,
  },
  {
    name: 'a Dialog’s close button hovers with a surface step, as it did',
    edits: [
      {
        file: '../src/recipes/dialog.ts',
        find: '        background: unfilledHover,\n        color: ref.text.overt,',
        replace: '        background: ref.surface.muted,\n        color: ref.text.overt,',
      },
    ],
    tests,
  },
]
