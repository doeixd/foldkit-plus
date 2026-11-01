/**
 * Back and Forward from a held list (#401), broken in turn:
 * `pnpm mutate packages/remote/test/history.mutations.ts`
 */
const tests = [
  'packages/remote/test/history.test.ts',
  'packages/remote/test/noOp.test.ts',
  'packages/remote/test/departed.test.ts',
]
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const model = '../src/model.ts'
const retain = '../src/retain.ts'
const domain = '../src/domain.ts'
const remote = '../src/remote.ts'

export default [
  edit(
    'a held list reads stale',
    model,
    '  !heldForHistory(remote.history, remote.connections, identity)',
    '  true',
  ),
  edit(
    'a held list is planned',
    domain,
    '      !heldForHistory(remote.history, remote.connections, connection.identity)',
    '      true',
  ),
  edit(
    "a list's page is remembered whether held or not",
    remote,
    '${String(sizeOf(remote))}\\u0000${held}`',
    '${String(sizeOf(remote))}`',
  ),
  edit(
    'why does not say a list is held',
    '../src/whyReasons.ts',
    '  else if (heldForHistory(remote.history, remote.connections, identity))',
    '  else if (false)',
  ),
  edit(
    'a navigation is not counted',
    model,
    'navigations: model.history.navigations + 1,',
    'navigations: model.history.navigations,',
  ),
  edit('every navigation reads as history', model, 'last: message.kind,', "last: 'history',"),
  edit('a link holds a list too', retain, "    history.last === 'history' &&\n", ''),
  edit(
    'a history navigation before leaving holds a list',
    retain,
    '    history.navigations > hold.after &&\n',
    '',
  ),
  edit(
    'a list changed while held stays held',
    retain,
    ' &&\n    connections[identity] === hold.connection',
    '',
  ),
  edit(
    'the window does not bound a hold',
    model,
    'now !== undefined && now < hold.until && ',
    'now !== undefined && ',
  ),
  edit(
    'a list shown again is fresh whatever navigation came back to it',
    model,
    'now < hold.until && heldForHistory(history, connections, identity)',
    'now < hold.until',
  ),
  edit(
    'a list shown again keeps its hold',
    model,
    '      connections = setConnectionStale(connections, identity, false)\n    delete held[identity]',
    '      connections = setConnectionStale(connections, identity, false)',
  ),
  edit(
    'a list stale as it left is held',
    model,
    ' || ages === true || current.stale) continue',
    ' || ages === true) continue',
  ),
  edit(
    'every hold has the default window',
    model,
    'until: now + lists.window,',
    'until: now + defaultHistoryWindow,',
  ),
  edit(
    'a hold outlives its list',
    model,
    '    if (Object.hasOwn(retained, identity)) held[identity] = hold',
    '    held[identity] = hold',
  ),
  edit(
    'holds are made anew on every change of roots',
    model,
    '  return { connections, history: unchanged ? history : { ...history, held } }',
    '  return { connections, history: { ...history, held } }',
  ),
  edit(
    'an invalidation keeps the hold',
    model,
    '    history: withoutHolds(model.history, [connection]),\n',
    '',
  ),
  edit(
    'asking again keeps the hold',
    model,
    '        history: withoutHolds(model.history, message.connections ?? []),\n',
    '',
  ),
  edit('retention says no time', domain, '      roots,\n      now,\n', '      roots,\n'),
  edit(
    'the window is not sent',
    domain,
    '...(options.historyWindow === undefined ? {} : { historyWindow: options.historyWindow }),',
    '',
  ),
  edit(
    'a window that is no number passes',
    domain,
    'if (window !== undefined && !(window >= 0))',
    'if (window !== undefined && window < 0)',
  ),
  edit("Remote.make's window is dropped", remote, '    historyWindow: config.historyWindow,\n', ''),
  edit(
    "the domain's retain entry drops its window",
    remote,
    'retentionChanged(current, { budget, historyWindow, grace: options.grace })',
    'retentionChanged(current, { budget, historyWindow: undefined, grace: options.grace })',
  ),
  edit(
    "Remote.retain's window is dropped",
    remote,
    '    historyWindow: checkedHistoryWindow(options.historyWindow),\n',
    '    historyWindow: undefined,\n',
  ),
]
