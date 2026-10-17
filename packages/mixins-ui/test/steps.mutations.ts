/**
 * The steps, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/steps.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/steps.test.ts'
const browser = 'packages/mixins-ui/test/steps.browser.test.ts'

export default [
  {
    name: 'the current step counts as complete',
    edits: [
      {
        file: '../src/steps.ts',
        find: 'if (index < current) return',
        replace: 'if (index <= current) return',
      },
    ],
    tests: [unit],
  },
  {
    name: 'no step is current to assistive technology',
    edits: [
      {
        file: '../src/steps.ts',
        find: "...(state === 'current' ? [h.AriaCurrent('step')] : [])",
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a step ahead is a button too',
    edits: [
      {
        file: '../src/steps.ts',
        find: "onSelect !== undefined && state === 'complete'",
        replace: "onSelect !== undefined && state !== 'current'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a completed step goes to the step after it',
    edits: [
      {
        file: '../src/steps.ts',
        find: 'h.OnClick(onSelect(index))',
        replace: 'h.OnClick(onSelect(index + 1))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a completed step submits the form around it',
    edits: [
      {
        file: '../src/steps.ts',
        find: "builders.trigger.attrs([h.Type('button'), h.OnClick",
        replace: 'builders.trigger.attrs([h.OnClick',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a connector trails the last step',
    edits: [
      { file: '../src/steps.ts', find: '...(index === last', replace: '...(index === last + 1' },
    ],
    tests: [unit],
  },
  {
    name: 'the number is read beside the position',
    edits: [
      {
        file: '../src/steps.ts',
        find: 'builders.marker.attrs([marked, h.AriaHidden(true)])',
        replace: 'builders.marker.attrs([marked])',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a narrow row keeps every label',
    edits: [
      {
        file: '../src/recipes/steps.ts',
        find: 'Style.nest(\':where([data-state]:not([aria-current="step"])) > * > &\', {',
        replace: "Style.nest(':where([data-state]) > * > &', {",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a narrow row still shares with steps showing no label',
    edits: [
      {
        file: '../src/recipes/steps.ts',
        find: 'Style.nest(\':where([data-state]:not([aria-current="step"]))&\', {',
        replace: "Style.nest(':where([data-none])&', {",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the row is no container, so a phone shows every label',
    edits: [
      {
        file: '../src/recipes/steps.ts',
        find: "containerType: 'inline-size',",
        replace: "containerType: 'normal',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a vertical line starts at the foot of the words',
    edits: [
      {
        file: '../src/recipes/steps.ts',
        find: "gridRow: '1 / 3',",
        replace: "gridRow: '2',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a vertical line starts at the top of its marker',
    edits: [
      { file: '../src/recipes/steps.ts', find: 'marginBlockStart: markerSize,', replace: '' },
    ],
    tests: [browser],
  },
  {
    name: 'a marker of the md size is not the md Avatar',
    edits: [
      {
        file: '../src/recipes/steps.ts',
        find: "md: marker('2.5rem'",
        replace: "md: marker('1.75rem'",
      },
    ],
    tests: [browser],
  },
  {
    name: "a step's content takes the size of the page",
    edits: [
      {
        file: '../src/recipes/steps.ts',
        find: "Style.self({ minInlineSize: '0', ...role('body'), color: ref.text.muted })",
        replace: "Style.self({ minInlineSize: '0', color: ref.text.muted })",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the current step fills its connector whatever its progress',
    edits: [
      {
        file: '../src/recipes/steps.ts',
        find: "'--_fk-steps-fill': 'var(--fk-steps-progress, 0)'",
        replace: "'--_fk-steps-fill': '1'",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a complete step leaves its connector empty',
    edits: [
      {
        file: '../src/recipes/steps.ts',
        find: "'--_fk-steps-fill': '1'",
        replace: "'--_fk-steps-fill': '0'",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the Progress connector is as thin as a line',
    edits: [{ file: '../src/recipes/steps.ts', find: "'--_fk-steps-line': track,", replace: '' }],
    tests: [browser],
  },
  {
    name: 'a dot marker draws no dot',
    edits: [
      { file: '../src/recipes/steps.ts', find: 'inlineSize: dot,', replace: "inlineSize: '0'," },
    ],
    tests: [browser],
  },
  {
    name: "a phone's row draws a long title over the next connector",
    edits: [
      {
        file: '../src/recipes/steps.ts',
        find: "Style.nest('& > *', { overflow: 'hidden', textOverflow: 'ellipsis' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: "a phone's row keeps its connectors long and cuts the title shown",
    edits: [
      {
        file: '../src/recipes/steps.ts',
        find: 'Style.at(narrow, Style.self({ minInlineSize: ref.space.xs })),',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: "a dot sits in its marker's corner",
    edits: [
      {
        file: '../src/recipes/steps.ts',
        find: "margin: 'auto',",
        replace: "margin: '0',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'progress past the end is drawn past it',
    edits: [
      {
        file: '../src/steps.ts',
        find: 'String(Math.min(1, Math.max(0, progress)))',
        replace: 'String(progress)',
      },
    ],
    tests: [unit],
  },
]
