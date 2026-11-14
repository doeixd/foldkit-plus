/**
 * Obligations: what `check` counts as supplied, the delegation rule, and the
 * check `conform` leaves for `detach` and `replace`:
 * `pnpm mutate packages/mixins/test/a11y.mutations.ts`. The type-level half
 * (`a11y.test-d.ts`) was mutated by hand: a `Conforms` that always holds, a
 * `delegated` taking any obligation, an `Owed` judging unknown slot names and
 * a `detach` keeping what the view supplied each leave its negative cases
 * unused.
 */
const unit = ['packages/mixins/test/a11y.test.ts']

export default [
  {
    name: 'any provides covers any obligation',
    edits: [
      {
        file: '../src/a11y.ts',
        find: '(Object.hasOwn(meta.slots, slot) && meta.slots[slot]!.provides.includes(obligation)) ||',
        replace: '(Object.hasOwn(meta.slots, slot) && meta.slots[slot]!.provides.length > 0) ||',
      },
    ],
    tests: unit,
  },
  {
    name: 'what a slot supplies counts on every slot',
    edits: [
      {
        file: '../src/a11y.ts',
        find: '(Object.hasOwn(meta.slots, slot) && meta.slots[slot]!.provides.includes(obligation)) ||',
        replace: '(Object.values(meta.slots).some(own => own.provides.includes(obligation))) ||',
      },
    ],
    tests: unit,
  },
  {
    name: 'a composed Behavior is not read',
    edits: [
      {
        file: '../src/a11y.ts',
        find: '    (meta.parts ?? []).some(part => suppliedOn(part.meta, slot, obligation)))',
        replace: '    false)',
      },
    ],
    tests: unit,
  },
  {
    name: 'a delegation is accepted without its provider',
    edits: [
      {
        file: '../src/a11y.ts',
        find: '      if (held && suppliedOn(delegation.provider.meta, delegation.to, owed)) continue',
        replace: '      continue',
      },
    ],
    tests: unit,
  },
  {
    name: 'a delegation is accepted when its provider is merely attached',
    edits: [
      {
        file: '../src/a11y.ts',
        find: '      if (held && suppliedOn(delegation.provider.meta, delegation.to, owed)) continue',
        replace: '      if (held) continue',
      },
    ],
    tests: unit,
  },
  {
    name: "a delegation takes any attachment of its provider's name",
    edits: [
      {
        file: '../src/a11y.ts',
        find: '      const held = mixins.includes(delegation.provider)',
        replace: '      const held = mixins.some(mixin => mixin.name === delegation.providerName)',
      },
    ],
    tests: unit,
  },
  {
    name: 'detach does not check the view again',
    edits: [
      {
        file: '../src/slotView.ts',
        find: '      view.mixins.filter((_, index) => index !== at),\n      view.render,\n    )\n    carry(view, next, true)',
        replace:
          '      view.mixins.filter((_, index) => index !== at),\n      view.render,\n    )\n    carry(view, next, false)',
      },
    ],
    tests: unit,
  },
  {
    name: 'replace does not check the view again',
    edits: [
      {
        file: '../src/slotView.ts',
        find: '      view.mixins.map((held, index) => (index === at ? mixin : held)),\n      view.render,\n    )\n    carry(view, next, true)',
        replace:
          '      view.mixins.map((held, index) => (index === at ? mixin : held)),\n      view.render,\n    )\n    carry(view, next, false)',
      },
    ],
    tests: unit,
  },
  {
    name: 'attach forgets the conformance',
    edits: [
      {
        file: '../src/slotView.ts',
        find: '    carry(view, next, false)\n    return next',
        replace: '    return next',
      },
    ],
    tests: unit,
  },
  {
    name: 'conform marks the view it was given',
    edits: [
      {
        file: '../src/a11y.ts',
        find: '    Conformed.record(conformed, [',
        replace: '    Conformed.record(view, [',
      },
    ],
    tests: unit,
  },
  {
    name: 'an optional slot left out is owed its obligations',
    edits: [
      {
        file: '../src/a11y.ts',
        find: 'if (obligations === undefined || !Object.hasOwn(slots, name) || slots[name]!.hidden) continue',
        replace: 'if (obligations === undefined) continue',
      },
    ],
    tests: unit,
  },
  {
    name: 'a Behavior slot records nothing it provides',
    edits: [
      {
        file: '../src/behavior.ts',
        find: '    provides: Object.freeze(provides.map(MetadataToken.nameOf)),',
        replace: '    provides: Object.freeze([]),',
      },
    ],
    tests: unit,
  },
]
