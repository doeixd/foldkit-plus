/**
 * `Site.accessOf`, broken in turn: `pnpm mutate packages/site/test/access.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/site/test/access.test.ts']

export default [
  {
    name: 'an unknown reader is refused rather than waited for',
    edits: [
      {
        file,
        find: 'if (Option.isNone(who)) return Access.Pending()',
        replace: 'if (Option.isNone(who)) continue',
      },
    ],
    tests,
  },
  {
    name: 'a refusing rule is passed over',
    edits: [
      {
        file,
        find: 'if ((access as NodeAccess<Who>).allow(who.value)) continue',
        replace: 'continue',
      },
    ],
    tests,
  },
  {
    name: "a node's own rule alone decides, not its ancestors'",
    edits: [
      {
        file,
        find: 'for (const node of Site.chainOf(site, route)) {\n      const { access } = node',
        replace:
          'for (const node of Site.chainOf(site, route).slice(-1)) {\n      const { access } = node',
      },
    ],
    tests,
  },
  {
    name: 'a rule that sends the reader back is followed',
    edits: [
      { file, find: 'if (Site.chainOf(site, target.route).includes(node))', replace: 'if (false)' },
    ],
    tests,
  },
  {
    name: 'only a rule that sends the reader to the same address is refused',
    edits: [
      {
        file,
        find: 'if (Site.chainOf(site, target.route).includes(node))',
        replace: 'if (target.url === Site.hrefOf(site, route))',
      },
    ],
    tests,
  },
  {
    name: 'the builder drops the rule',
    edits: [
      {
        file,
        find: 'access: access => at(Object.freeze({ ...built, access })),',
        replace: 'access: () => at(built),',
      },
    ],
    tests,
  },
  {
    name: 'the options drop the rule',
    edits: [
      {
        file,
        find: 'if (options?.access !== undefined) built = built.access(options.access)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'access decided leaf first',
    edits: [
      {
        file,
        find: 'for (const node of Site.chainOf(site, route)) {\n      const { access } = node',
        replace:
          'for (const node of [...Site.chainOf(site, route)].reverse()) {\n      const { access } = node',
      },
    ],
    tests,
  },
  {
    name: "an ancestor's rule allows an unknown reader",
    edits: [
      {
        file,
        find: 'if (Option.isNone(who)) return Access.Pending()',
        replace:
          'if (Option.isNone(who)) return node.tag === "Projects" ? Access.Allowed() : Access.Pending()',
      },
    ],
    tests,
  },
]
