/**
 * Reading `may` on the client, broken in turn:
 * `pnpm mutate packages/guard/test/may.mutations.ts`.
 */
const file = '../src/may.ts'
const tests = [
  'packages/guard/test/server.test.ts',
  'packages/guard/test/mayUnanswered.test.ts',
  'packages/guard/test/mayForbids.test.ts',
]
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a member may be set whatever the row’s Update',
    "can(may, 'Update') && !refuses(may.members, member)",
    '!refuses(may.members, member)',
  ),
  edit(
    'a member’s own rule is not read',
    "can(may, 'Update') && !refuses(may.members, member)",
    "can(may, 'Update')",
  ),
  edit(
    'a relation may be pointed whatever the row’s Update',
    "can(may, 'Update') && !refusesLink(may, relation, interaction)",
    '!refusesLink(may, relation, interaction)',
  ),
  edit(
    'a relation’s own rule is not read',
    "can(may, 'Update') && !refusesLink(may, relation, interaction)",
    "can(may, 'Update')",
  ),
  edit(
    'an interaction is read off the prototype',
    'Record.get(may.row, interaction)',
    'Option.fromUndefinedOr(may.row[interaction])',
  ),
  edit(
    'what was not said reads as a yes',
    'Verdict.isTrue(answer(may, interaction))',
    '!Verdict.isFalse(answer(may, interaction))',
  ),
  edit(
    'what was not said reads as a no',
    'Option.exists(Record.get(answers, key), said => !said)',
    '!Option.getOrElse(Record.get(answers, key), () => false)',
  ),
  edit(
    'a no reads as nothing said',
    'Option.exists(Record.get(answers, key), said => !said)',
    'false',
  ),
  edit(
    'a row’s Update that was not said locks every key',
    "if (refuses(may.row, 'Update')) return true",
    "if (!can(may, 'Update')) return true",
  ),
  edit(
    'a refused Update locks nothing',
    "if (refuses(may.row, 'Update')) return true",
    'if (false) return true',
  ),
  edit(
    'a relation is locked only when it may not be unlinked',
    "? refusesLink(may, member, 'Unlink') || refusesLink(may, member, 'Link')",
    "? refusesLink(may, member, 'Unlink')",
  ),
  edit(
    'a relation is locked only when it may not be linked',
    "? refusesLink(may, member, 'Unlink') || refusesLink(may, member, 'Link')",
    "? refusesLink(may, member, 'Link')",
  ),
  edit(
    'a relation is locked as a member',
    'return Object.hasOwn(entity.relations, member)',
    'return false',
  ),
  edit('a member’s own refusal does not lock it', ': refuses(may.members, member)', ': false'),
  edit(
    'an unanswered may locks everything',
    'if (!isMay(may)) return false',
    'if (!isMay(may)) return true',
  ),
  edit(
    'a relation’s refusal lets the write be made',
    'refusesLink(value, relation, interaction),',
    'false,',
  ),
  edit(
    'a relation with no rule of its own refuses',
    'Option.exists(Record.get(may.relations, relation), said => !said[interaction])',
    'Option.match(Record.get(may.relations, relation), { onNone: () => true, onSome: said => !said[interaction] })',
  ),
]
