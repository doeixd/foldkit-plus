/**
 * What a view remembers of its attachments, `detach` and `replace`, the
 * contributors a conflict names, a child attribute's Mount (#531) and
 * `SlotView.over`: `pnpm mutate packages/mixins/test/attachments.mutations.ts`.
 */
const unit = ['packages/mixins/test/attachments.test.ts']
const browser = ['packages/mixins/test/childMount.browser.test.ts']
const over = ['packages/mixins/test/over.test.ts']
const surfaceOver = ['packages/mixins-surface/test/over.test.ts']

export default [
  {
    name: 'a conflict is not told who gave each contribution',
    edits: [
      {
        file: '../src/slotView.ts',
        find: 'contributions.push({ ...evaluated, source: mixin.name })',
        replace: 'contributions.push(evaluated)',
      },
    ],
    tests: unit,
  },
  {
    name: 'a conflict names the view for every contributor',
    edits: [
      {
        file: '../src/resolver.ts',
        find: "    source = contribution.source ?? 'a Mixin'\n",
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: "the view's child attribute keeps its Mount apart",
    edits: [
      {
        file: '../src/resolver.ts',
        find: '      if (isMount(inner)) return addMount(inner.action, attribute)\n      if (isTagged(inner)) reserve(inner._tag, inner)',
        replace: '      if (isTagged(inner)) reserve(inner._tag, inner)',
      },
    ],
    tests: browser,
  },
  {
    name: "a Mixin's child attribute keeps its Mount apart",
    edits: [
      {
        file: '../src/resolver.ts',
        find: '      if (isMount(inner)) return addMount(inner.action, attribute)\n      if (isTagged(inner)) claim(inner._tag, inner)',
        replace: '      if (isTagged(inner)) claim(inner._tag, inner)',
      },
    ],
    tests: unit,
  },
  {
    name: "a child's Mount sends through the parent's dispatch",
    edits: [
      {
        file: '../src/resolver.ts',
        find: '  const child = held.child\n',
        replace: '  const child = undefined as ChildAttribute | undefined\n',
      },
    ],
    tests: browser,
  },
  {
    name: 'detach drops the attachments after the named one too',
    edits: [
      {
        file: '../src/slotView.ts',
        find: 'view.mixins.filter((_, index) => index !== at)',
        replace: 'view.mixins.filter((_, index) => index < at)',
      },
    ],
    tests: unit,
  },
  {
    name: 'detach and replace take the first of two by one name',
    edits: [
      { file: '../src/slotView.ts', find: 'if (found.length > 1) {', replace: 'if (false) {' },
    ],
    tests: unit,
  },
  {
    name: 'replace appends instead of keeping the place',
    edits: [
      {
        file: '../src/slotView.ts',
        find: 'view.mixins.map((held, index) => (index === at ? mixin : held))',
        replace: '[...view.mixins.filter((_, index) => index !== at), mixin]',
      },
    ],
    tests: unit,
  },
  {
    name: 'a Behavior is remembered as reading the input whatever it gives',
    edits: [
      {
        file: '../src/behavior.ts',
        find: "attributes === undefined && mount === undefined ? 'static' : 'input',",
        replace: "'input',",
      },
    ],
    tests: unit,
  },
  {
    name: 'a Behavior forgets what it requires',
    edits: [
      {
        file: '../src/behavior.ts',
        find: '        slotOptions?.requires ?? {},',
        replace: '        {},',
      },
    ],
    tests: unit,
  },
  {
    name: 'a Style piece is remembered as static whatever it reads',
    edits: [
      {
        file: '../src/style.ts',
        find: "reads: Mixin.isDynamic(contribution) ? 'input' : 'static',",
        replace: "reads: 'static',",
      },
    ],
    tests: unit,
  },
  {
    name: 'a composition forgets its parts',
    edits: [
      {
        file: '../src/mixin.ts',
        find: '            ...(mixin.meta === undefined ? {} : { meta: mixin.meta }),\n',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'isBound reads a binder by its keys',
    edits: [
      {
        file: '../src/slotView.ts',
        find: 'Object.hasOwn(value, BOUND)',
        replace: "Object.hasOwn(value, 'slots')",
      },
    ],
    tests: over,
  },
  {
    name: "SurfaceView.over's define leaves the view unnamed",
    edits: [
      {
        file: '../../mixins-surface/src/surfaceView.ts',
        find: ') => define(surface, slots, render, options),',
        replace: ') => SlotView.define(slots, render, options),',
      },
    ],
    tests: surfaceOver,
  },
]
