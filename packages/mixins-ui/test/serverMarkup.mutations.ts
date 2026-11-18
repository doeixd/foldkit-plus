/**
 * What a server draws that a form or assistive technology reads, broken in
 * turn: `pnpm mutate packages/mixins-ui/test/serverMarkup.mutations.ts`.
 */
const page = ['packages/mixins-ui/test/serverMarkup.ssr.test.ts']

export default [
  {
    name: 'a shut accordion panel stays reachable',
    edits: [
      {
        file: '../src/accordion.ts',
        find: "...(shown ? [] : [h.Attribute('inert', '')]),",
        replace: '',
      },
    ],
    tests: page,
  },
  {
    name: 'a shut tree group stays reachable',
    edits: [
      {
        file: '../src/treeView.ts',
        find: "...(shown ? [] : [h.Attribute('inert', '')]),",
        replace: '',
      },
    ],
    tests: page,
  },
  {
    name: 'a tree row forgets its check',
    edits: [
      {
        file: '../src/treeView.ts',
        find: '...(checks === undefined ? [] : [h.AriaChecked(checks.get(node.id) ?? false)]),',
        replace: '',
      },
    ],
    tests: page,
  },
  {
    name: 'a segmented option submits under no name',
    edits: [{ file: '../src/segmented.ts', find: 'h.Name(name),', replace: '' }],
    tests: page,
  },
  {
    name: 'a slider description is not wired to its input',
    edits: [
      {
        file: '../src/slider.ts',
        find: '...(options.description === undefined ? [] : [h.AriaDescribedBy(descriptionId)]),',
        replace: '',
      },
    ],
    tests: page,
  },
  {
    name: 'a slider submits under no name',
    edits: [
      {
        file: '../src/slider.ts',
        find: '...(options.name === undefined ? [] : [h.Name(options.name)]),',
        replace: '',
      },
    ],
    tests: page,
  },
  {
    name: 'a rating submits under its id, not its name',
    edits: [
      {
        file: '../src/rating.ts',
        find: 'h.Name(options.name ?? options.id),',
        replace: 'h.Name(options.id),',
      },
    ],
    tests: page,
  },
  {
    name: 'a carousel slide out of view takes focus',
    edits: [
      { file: '../src/carousel.ts', find: '...(shown ? [] : [h.Inert(true)]),', replace: '' },
    ],
    tests: page,
  },
  {
    name: 'the carousel picker marks no current slide',
    edits: [{ file: '../src/carousel.ts', find: "h.AriaCurrent('true'),", replace: '' }],
    tests: page,
  },
  {
    name: 'a nav trigger names a panel that is not drawn',
    edits: [
      {
        file: '../src/nav.ts',
        find: '...(shown ? [h.AriaControls(panelId(model.id, index))] : []),',
        replace: '...[h.AriaControls(panelId(model.id, index))],',
      },
    ],
    tests: page,
  },
  {
    name: 'a step in progress is not current',
    edits: [
      {
        file: '../src/steps.ts',
        find: "...(state === 'current' ? [h.AriaCurrent('step')] : []),",
        replace: '',
      },
    ],
    tests: page,
  },
  {
    name: 'the current breadcrumb step is not marked',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: "builders.current.attrs([h.AriaCurrent('page'), ...name])",
        replace: 'builders.current.attrs([...name])',
      },
    ],
    tests: page,
  },
  {
    name: 'the current pagination stop is not marked',
    edits: [
      {
        file: '../src/pagination.ts',
        find: "...(item === current ? [h.AriaCurrent('page')] : []),",
        replace: '',
      },
    ],
    tests: page,
  },
  {
    name: 'a selected card is not pressed',
    edits: [
      {
        file: '../src/press.ts',
        find: '...(state.selected === undefined ? [] : [h.AriaPressed(flag(state.selected))]),',
        replace: '',
      },
    ],
    tests: page,
  },
  {
    name: 'an error toast is not in the alert region',
    edits: [
      {
        file: '../src/toast.ts',
        find: "builders.alert.attrs([h.Role('alert'),",
        replace: "builders.alert.attrs([h.Role('status'),",
      },
    ],
    tests: page,
  },
]
