/**
 * The resizable split, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/resizable.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/resizable.ts'
const unit = 'packages/mixins-ui/test/resizable.test.ts'
const browser = 'packages/mixins-ui/test/resizable.browser.test.ts'
const recipe = '../src/recipes/resizable.ts'

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
    name: 'the handle reads the arrows physically right to left',
    edits: [
      {
        file,
        find: 'const key = readingKey(pressed, options.direction)',
        replace: 'const key = pressed',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a drag right to left follows the pointer physically',
    edits: [
      {
        file,
        find: "const across = options.direction === 'rtl' ? -1 : 1",
        replace: 'const across = 1',
      },
    ],
    tests: [browser],
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
  {
    name: 'the view swaps its keys but draws no direction',
    edits: [
      {
        file: file,
        find: '...(options.direction === undefined ? [] : [h.Dir(options.direction)]),',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a collapsed panel forgets where it was',
    edits: [
      {
        file,
        find: 'restore: () => Option.some(model.share) }',
        replace: 'restore: () => Option.some(0.5) }',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the second panel collapses like the first',
    edits: [
      {
        file,
        find: "collapsible === 'first' ? (bounds.collapsedTo ?? 0) : 1 - (bounds.collapsedTo ?? 0)",
        replace: '(bounds.collapsedTo ?? 0)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a split with nothing collapsible collapses its first panel',
    edits: [
      { file, find: '      if (bounds.collapsible === undefined) return model\n', replace: '' },
    ],
    tests: [unit],
  },
  {
    name: 'a key keeps where to go back to',
    edits: [
      {
        file,
        find: 'share: () => share, restore: () => Option.none() })',
        replace: 'share: () => share })',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a key at the bound makes a new Model',
    edits: [
      { file, find: 'share === model.share && Option.isNone(model.restore)', replace: 'false' },
    ],
    tests: [unit],
  },
  {
    name: 'Enter does not collapse',
    edits: [
      {
        file,
        find: "if (key === 'Enter' && collapsible !== undefined) return Option.some(toggled)",
        replace: '',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'Enter is taken where nothing collapses',
    edits: [
      {
        file,
        find: "if (key === 'Enter' && collapsible !== undefined)",
        replace: "if (key === 'Enter')",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a double-click does nothing',
    edits: [
      {
        file,
        find: '...(collapsible === undefined ? [] : [h.OnDoubleClick(toggled)]),',
        replace: '',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the second panel is marked collapsed for the first',
    edits: [{ file, find: 'collapsed && collapsible === panel ?', replace: 'collapsed ?' }],
    tests: [browser],
  },
  {
    name: 'the separator cannot say it is collapsed',
    edits: [
      { file, find: "collapsible === 'first' ? (options.collapsedTo ?? 0) : 1,", replace: '1,' },
    ],
    tests: [unit],
  },
  {
    name: 'a drag is not marked',
    edits: [
      {
        file,
        find: "...(Option.isSome(options.model.from) ? [h.DataAttribute('dragging', '')] : []),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the grip is read aloud',
    edits: [
      {
        file,
        find: 'h.span(builders.grip.attrs([h.AriaHidden(true)]), [])',
        replace: 'h.span(builders.grip.attrs([]), [])',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a split does not fill its panel',
    edits: [
      {
        file: recipe,
        find: "        blockSize: '100%',\n        minBlockSize: '0',",
        replace: "        minBlockSize: '0',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a collapse jumps',
    edits: [
      {
        file: recipe,
        find: 'transitionDuration: travelled(ref.motion.moderate),',
        replace: "transitionDuration: '0s',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a drag eases behind the pointer',
    edits: [
      {
        file: recipe,
        find: "Style.nest(':where([data-dragging]) > &', { transitionDuration: '0s' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the line keeps its grey under the pointer',
    edits: [
      {
        file: recipe,
        find: '      Style.pseudo(held, {\n        background: ref.accent.default,',
        replace: '      Style.pseudo(held, {\n        background: ref.outline.default,',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the accent line is no thicker',
    edits: [
      {
        file: recipe,
        find: '      Style.pseudo(held, {\n        background: ref.accent.default,\n        boxShadow: `0 0 0 ${ref.border.thin} ${ref.accent.default}`,',
        replace:
          "      Style.pseudo(held, {\n        background: ref.accent.default,\n        boxShadow: 'none',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the grip shows on a plain line',
    edits: [
      {
        file: recipe,
        find: "grip: component(Style.self({ display: 'none' })),",
        replace: "grip: component(Style.self({ display: 'block' })),",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the grip hangs off one side of the line',
    edits: [{ file: recipe, find: "translate: '-50% -50%',", replace: "translate: '0 -50%'," }],
    tests: [browser],
  },
  {
    name: 'a vertical split keeps a standing grip',
    edits: [
      {
        file: recipe,
        find: "inlineSize: '1.25rem',\n            blockSize: '0.75rem',",
        replace: "inlineSize: '0.75rem',\n            blockSize: '1.25rem',",
      },
    ],
    tests: [browser],
  },
]
