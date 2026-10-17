/**
 * The thinking steps, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/thinkingSteps.mutations.ts` checks
 * that a test fails for every one.
 */
const unit = ['packages/mixins-ui/test/thinkingSteps.test.ts']
const browser = ['packages/mixins-ui/test/thinkingSteps.browser.test.ts']
const view = '../src/thinkingSteps.ts'
const recipe = '../src/recipes/thinkingSteps.ts'

export default [
  {
    name: 'a failure outranks a running step',
    edits: [
      {
        file: view,
        find: "  if (steps.some(step => step.state === 'running')) return 'running'\n  if (steps.some(step => step.state === 'failed')) return 'failed'\n",
        replace:
          "  if (steps.some(step => step.state === 'failed')) return 'failed'\n  if (steps.some(step => step.state === 'running')) return 'running'\n",
      },
    ],
    tests: unit,
  },
  {
    name: 'a trace with no steps is done',
    edits: [
      {
        file: view,
        find: 'return steps.length > 0 && steps.every(',
        replace: 'return steps.every(',
      },
    ],
    tests: unit,
  },
  {
    name: 'an untouched trace is always open',
    edits: [
      {
        file: view,
        find: "Option.getOrElse(open, () => stateOf(steps) === 'running')",
        replace: 'Option.getOrElse(open, () => true)',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'tenths past ten seconds',
    edits: [{ file: view, find: 'if (seconds < 10) return', replace: 'if (seconds < 60) return' }],
    tests: unit,
  },
  {
    name: 'the steps’ durations are not summed',
    edits: [
      {
        file: view,
        find: 'Option.orElse(Option.fromUndefinedOr(options.duration), () => summed(options.steps))',
        replace: 'Option.fromUndefinedOr(options.duration)',
      },
    ],
    tests: unit,
  },
  {
    name: 'the summary is the first running step’s, of several',
    edits: [
      { file: view, find: 'Arr.findLast(options.steps,', replace: 'Arr.findFirst(options.steps,' },
    ],
    tests: unit,
  },
  {
    name: 'the trigger flips the drawn state',
    edits: [
      {
        file: view,
        find: 'h.OnClick(options.onToggle(!open))',
        replace: 'h.OnClick(options.onToggle(open))',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a shut list is in reach',
    edits: [
      {
        file: view,
        find: 'builders.panel.attrs([h.Id(panelId), ...shut(open)])',
        replace: 'builders.panel.attrs([h.Id(panelId)])',
      },
    ],
    tests: unit,
  },
  {
    name: 'the state is said in English whatever the words',
    edits: [{ file: view, find: '[words[step.state]]', replace: '[englishStates[step.state]]' }],
    tests: unit,
  },
  {
    name: 'the marker is read aloud',
    edits: [
      {
        file: view,
        find: 'builders.marker.attrs([marked, h.AriaHidden(true)])',
        replace: 'builders.marker.attrs([marked])',
      },
    ],
    tests: unit,
  },
  {
    name: 'a step’s own list is named by the trigger',
    edits: [{ file: view, find: '[list(inner, titleId)]', replace: '[list(inner, triggerId)]' }],
    tests: unit,
  },
  {
    name: 'details are shut when steps do not toggle',
    edits: [
      {
        file: view,
        find: 'const isOpen = !toggles || openSteps.has(step.id)',
        replace: 'const isOpen = openSteps.has(step.id)',
      },
    ],
    tests: unit,
  },
  {
    name: 'a step with nothing under it toggles',
    edits: [
      {
        file: view,
        find: 'const toggles = hasBody && onToggleStep !== undefined',
        replace: 'const toggles = onToggleStep !== undefined',
      },
    ],
    tests: unit,
  },
  {
    name: 'a step’s words run together',
    edits: [
      {
        file: view,
        find: "...Arr.intersperse<Html | string>(' ')([",
        replace: "...Arr.intersperse<Html | string>('')([",
      },
    ],
    tests: unit,
  },
  {
    name: 'the summary shimmers once done',
    edits: [{ file: recipe, find: `shimmer('&[data-state="running"]')`, replace: 'shimmer()' }],
    tests: browser,
  },
  {
    name: 'the list does not shut',
    edits: [
      {
        file: recipe,
        find: "root: component(opensBelow(open), Style.self({ ...role('body') })),",
        replace: "root: component(Style.self({ ...role('body') })),",
      },
    ],
    tests: browser,
  },
  {
    name: 'a step’s detail does not shut',
    edits: [
      {
        file: recipe,
        find: "step: component(opensBelow(open), Style.self({ position: 'relative' })),",
        replace: "step: component(Style.self({ position: 'relative' })),",
      },
    ],
    tests: browser,
  },
  {
    name: 'the chevron turns with the root, not its trigger',
    edits: [
      {
        file: recipe,
        find: 'turningChevron(\'[aria-expanded="true"]\'',
        replace: 'turningChevron(open',
      },
    ],
    tests: browser,
  },
  {
    name: 'every marker turns, not only a running one',
    edits: [
      {
        file: recipe,
        find: "turning(`calc(${ref.motion.slow} * 3)`, marked('running'))",
        replace: 'turning(`calc(${ref.motion.slow} * 3)`)',
      },
    ],
    tests: browser,
  },
  {
    name: 'a done marker draws no check',
    edits: [
      {
        file: recipe,
        find: "        rotate: '45deg',\n      }),\n      Style.nest(state('done')",
        replace: "        rotate: '0deg',\n      }),\n      Style.nest(state('done')",
      },
    ],
    tests: browser,
  },
  {
    name: 'a failed marker draws one bar',
    edits: [
      {
        file: recipe,
        find: "Style.nest(`${marked('failed')}::after`, bar('-45deg')),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a done marker is muted',
    edits: [
      {
        file: recipe,
        find: "      Style.nest(state('done'), { color: ref.success.ink }),\n",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a pending marker draws no ring',
    edits: [
      {
        file: recipe,
        find: "Style.nest(marked('pending'), { border: `${ref.border.thin} solid ${ref.outline.overt}` }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the marker sits at the top of the line',
    edits: [
      {
        file: recipe,
        find: '        marginBlockStart: `calc((1lh - ${size}) / 2)`,\n',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the state’s words are shown',
    edits: [
      {
        file: recipe,
        find: '    state: component(Utilities.srOnly),',
        replace: '    state: component(),',
      },
    ],
    tests: browser,
  },
  {
    name: 'the last step draws a line too',
    edits: [
      {
        file: recipe,
        find: "Style.nest('&:not(:last-child)::before', {",
        replace: "Style.nest('&::before', {",
      },
    ],
    tests: browser,
  },
  {
    name: 'the line runs through the marker',
    edits: [
      {
        file: recipe,
        find: "insetBlockStart: `calc((1lh + ${size}) / 2 + ${ref.space['2xs']})`,",
        replace: "insetBlockStart: '0',",
      },
    ],
    tests: browser,
  },
]
