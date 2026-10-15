/**
 * The resizable split, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/resizable.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/resizable.ts'
const unit = 'packages/mixins-ui/test/resizable.test.ts'

export default [
  {
    name: 'a share with no bounds may fill the group',
    edits: [
      {
        file,
        find: 'Math.round(Math.min(bounds.max ?? 0.9, Math.max(bounds.min ?? 0.1, share)) * 1000) / 1000',
        replace:
          'Math.round(Math.min(bounds.max ?? 1, Math.max(bounds.min ?? 0, share)) * 1000) / 1000',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a share keeps its float noise',
    edits: [
      {
        file,
        find: 'Math.round(Math.min(bounds.max ?? 0.9, Math.max(bounds.min ?? 0.1, share)) * 1000) / 1000',
        replace: 'Math.min(bounds.max ?? 0.9, Math.max(bounds.min ?? 0.1, share))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a drag moves from the last move, not where it began',
    edits: [
      {
        file,
        find: 'clamped(from + delta / model.size, bounds)',
        replace: 'clamped(model.share + delta / model.size, bounds)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a drag moves before the group is measured',
    edits: [{ file, find: 'if (model.size <= 0) return model\n', replace: '' }],
    tests: [unit],
  },
  {
    name: 'an ended drag keeps where it began',
    edits: [
      {
        file,
        find: 'Option.isNone(model.from) ? model : modifyFields(model, { from: () => Option.none() }),',
        replace: 'model,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'ArrowLeft grows the first panel',
    edits: [{ file, find: "['ArrowLeft', -step],", replace: "['ArrowLeft', step]," }],
    tests: [unit],
  },
  {
    name: 'a vertical split steps on the horizontal arrows',
    edits: [
      {
        file,
        find: 'const keys = new Map<string, number>(\n    vertical',
        replace: 'const keys = new Map<string, number>(\n    false',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Home goes to the far bound',
    edits: [
      {
        file,
        find: "if (key === 'Home') return Option.some(lift(Message.Set({ share: options.min ?? 0.1 })))",
        replace:
          "if (key === 'Home') return Option.some(lift(Message.Set({ share: options.max ?? 0.9 })))",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the handle reads as lying along the split',
    edits: [
      {
        file,
        find: "h.AriaOrientation(vertical ? 'horizontal' : 'vertical'),",
        replace: "h.AriaOrientation(vertical ? 'vertical' : 'horizontal'),",
      },
    ],
    tests: [unit],
  },
]
