/**
 * The `conflict` check of every widget that takes application key routes, broken in
 * turn: `pnpm mutate packages/mixins-ui/test/keyConflict.mutations.ts`. A check that leaves
 * out a widget's own routes, reads the wrong input, or names another slot, and a view that
 * stops drawing the list its check reads, must each fail `keyConflict.test.ts`, which holds
 * the two to one answer.
 */
const tests = ['packages/mixins-ui/test/keyConflict.test.ts']

const edit = (file: string, find: string, replace: string) => [{ file, find, replace }]

export default [
  {
    name: 'Command.conflict leaves out the menu own keys',
    edits: edit(
      '../src/command.ts',
      '[...ownRoutes<Value, Message>(() => () => Option.none()), ...routes],',
      '[...routes],',
    ),
    tests,
  },
  {
    name: 'the Command view stops drawing the shared own routes',
    edits: edit(
      '../src/command.ts',
      'routes: [...ownRoutes<Value, Message>(name => answers[name]), ...(options.routes ?? [])],',
      'routes: [...(options.routes ?? [])],',
    ),
    tests,
  },
  {
    name: 'SearchField.conflict leaves out Escape',
    edits: edit(
      '../src/searchField.ts',
      '[...ownRoutes<Message>(() => Option.none()), ...routes],',
      '[...routes],',
    ),
    tests,
  },
  {
    name: 'SearchField.conflict names no slot',
    edits: edit('../src/searchField.ts', "Option.some('input'),", 'Option.none(),'),
    tests,
  },
  {
    name: 'the SearchField view stops drawing the shared own routes',
    edits: edit(
      '../src/searchField.ts',
      "...ownRoutes<Message>(words => (words === '' ? Option.none() : Option.some(options.onClear))),",
      '',
    ),
    tests,
  },
  {
    name: 'Menubar.conflict ignores the direction',
    edits: edit(
      '../src/menubar.ts',
      '[...ownRoutes<ParentMessage>(input.direction, () => Option.none()), ...routes],',
      '[...ownRoutes<ParentMessage>(undefined, () => Option.none()), ...routes],',
    ),
    tests,
  },
  {
    name: 'CascadeSelect.conflict leaves out the panel own keys',
    edits: edit(
      '../src/cascadeSelect.ts',
      '[...ownRoutes<ParentMessage>(undefined, () => Option.none()), ...routes],',
      '[...routes],',
    ),
    tests,
  },
  {
    name: 'the CascadeSelect view stops drawing the shared own routes',
    edits: edit(
      '../src/cascadeSelect.ts',
      '...ownRoutes(options.direction, message => Option.some(send(message))),',
      '',
    ),
    tests,
  },
  {
    name: 'Tour.conflict ignores closeOnEscape',
    edits: edit(
      '../src/tour.ts',
      '[...ownRoutes<ParentMessage>(input, () => Option.none()), ...routes],',
      '[...ownRoutes<ParentMessage>({}, () => Option.none()), ...routes],',
    ),
    tests,
  },
  {
    name: 'the Tour view stops drawing the shared own routes',
    edits: edit(
      '../src/tour.ts',
      '...ownRoutes(options, message => Option.some(send(message))),',
      '',
    ),
    tests,
  },
  {
    name: 'FloatingPanel.conflict ignores closeOnEscape',
    edits: edit(
      '../src/floatingPanel.ts',
      '[...ownRoutes<ParentMessage>(input.closeOnEscape, () => Option.none()), ...routes],',
      '[...ownRoutes<ParentMessage>(undefined, () => Option.none()), ...routes],',
    ),
    tests,
  },
  {
    name: 'the FloatingPanel view stops drawing the shared own routes',
    edits: edit(
      '../src/floatingPanel.ts',
      '...ownRoutes(options.closeOnEscape, () => Option.some(send(Message.Closed()))),',
      '',
    ),
    tests,
  },
  {
    name: 'Picker.conflict leaves out the option own keys',
    edits: edit(
      '../src/picker.ts',
      '[...ownRoutes<Outer>(() => Option.none()), ...routes],',
      '[...routes],',
    ),
    tests,
  },
  {
    name: 'Nav.conflict leaves out the row own keys',
    edits: edit(
      '../src/nav.ts',
      '[...ownTopRoutes<Message>(() => Option.none()), ...routes],',
      '[...routes],',
    ),
    tests,
  },
  {
    name: 'Nav.conflict ignores the panel routes',
    edits: edit('../src/nav.ts', '...(input.panelRoutes ?? [])],', '],'),
    tests,
  },
  {
    name: 'Nav.conflict leaves out the panel own keys',
    edits: edit(
      '../src/nav.ts',
      '[...ownPanelRoutes<Message>(() => Option.none()), ...(input.panelRoutes ?? [])],',
      '[...(input.panelRoutes ?? [])],',
    ),
    tests,
  },
  {
    name: 'Tabs.conflict ignores the close',
    edits: edit(
      '../src/tabs.ts',
      'Behaviors.Keys.conflict([...ownRoutes(input.close), ...routes],',
      'Behaviors.Keys.conflict([...routes],',
    ),
    tests,
  },
  {
    name: 'the tabs stop drawing the shared own routes',
    edits: edit('../src/tabs.ts', '    ...ownRoutes(close),\n', ''),
    tests,
  },
  {
    name: 'TagsInput.conflict ignores the delimiter',
    edits: edit(
      '../src/tagsInput.ts',
      'delimiter: input.delimiter ?? DEFAULT_DELIMITER,',
      'delimiter: DEFAULT_DELIMITER,',
    ),
    tests,
  },
  {
    name: 'TagsInput.conflict ignores the direction',
    edits: edit('../src/tagsInput.ts', 'direction: input.direction },', 'direction: undefined },'),
    tests,
  },
  {
    name: 'Toolbar.conflict ignores the orientation',
    edits: edit(
      '../src/toolbar.ts',
      "[...ownRoutes<Message>(input.orientation ?? 'horizontal', () => Option.none()), ...routes],",
      "[...ownRoutes<Message>('horizontal', () => Option.none()), ...routes],",
    ),
    tests,
  },
]
