/**
 * A Slot's events and attributes have one owner and one protection, however a
 * Mixin spells them (#523, #524):
 * `pnpm mutate packages/mixins/test/protectedAttributes.mutations.ts`.
 */
const resolver = '../src/resolver.ts'
const names = '../src/foldkitNames.ts'
const tests = ['packages/mixins/test/resolver.test.ts', 'packages/mixins/test/foldkitNames.test.ts']

export default [
  {
    name: 'a generic Attribute is compared by its tag, not its key',
    edits: [{ file: names, find: "  ['Attribute', (key: string) => key],\n", replace: '' }],
    tests,
  },
  {
    name: 'a Prop is compared by its tag, not its key',
    edits: [
      {
        file: names,
        find: "  ['Prop', (key: string) => ATTRIBUTE_OF_PROPERTY.get(key) ?? key],\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a Prop is compared by its property name, not its attribute',
    edits: [
      {
        file: names,
        find: '(key: string) => ATTRIBUTE_OF_PROPERTY.get(key) ?? key',
        replace: '(key: string) => key',
      },
    ],
    tests,
  },
  {
    name: 'a DataAttribute is compared without its data- prefix',
    edits: [
      {
        file: names,
        find: "['DataAttribute', (key: string) => `data-${key}`]",
        replace: "['DataAttribute', (key: string) => key]",
      },
    ],
    tests,
  },
  {
    name: 'a typed builder is compared by its tag, not the attribute it writes',
    edits: [
      {
        file: names,
        find: 'return normalizeName(ATTRIBUTE_OF_TAG.get(tag) ?? tag)',
        replace: 'return normalizeName(tag)',
      },
    ],
    tests,
  },
  {
    name: 'the protected list keeps its spelling',
    edits: [
      {
        file: resolver,
        find: '(protection?.attributes ?? []).map(attr => normalizeName(MetadataToken.nameOf(attr)))',
        replace: '(protection?.attributes ?? []).map(attr => MetadataToken.nameOf(attr))',
      },
    ],
    tests,
  },
  {
    name: 'a custom event is not read as the event it names',
    edits: [
      {
        file: names,
        find: "  if (tag !== 'OnCustomEvent') return Option.none()",
        replace: '  return Option.none()',
      },
    ],
    tests,
  },
  {
    name: 'a custom event name keeps its spelling',
    edits: [
      {
        file: names,
        find: "return typeof name === 'string' ? Option.some(normalizeName(name)) : Option.none()",
        replace: "return typeof name === 'string' ? Option.some(name) : Option.none()",
      },
    ],
    tests,
  },
  {
    name: 'a prevent-default keydown is its own event, as its tag spells it',
    edits: [
      {
        file: names,
        find: "  OnKeyDownPreventDefault: 'keydown',",
        replace: "  OnKeyDownPreventDefault: 'keydownpreventdefault',",
      },
    ],
    tests,
  },
  {
    name: 'a handler Foldkit lacks is guessed, not refused',
    edits: [
      {
        file: resolver,
        find: '    if (isUnknownHandler(tag)) failUnknownHandler(tag)\n    const eventName',
        replace: '    const eventName',
      },
    ],
    tests,
  },
  {
    name: 'the view owns an attribute by its tag',
    edits: [
      {
        file: resolver,
        find: 'onNone: () => ownedAttributes.set(attributeNameOf(tag, value), tag)',
        replace: 'onNone: () => ownedAttributes.set(tag, tag)',
      },
    ],
    tests,
  },
  {
    name: "a Mixin's child attribute skips the checks",
    edits: [
      {
        file: resolver,
        find: '      if (isTagged(inner)) claim(inner._tag, inner)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: "a Mixin's child Class is kept as a second class list",
    edits: [
      {
        file: resolver,
        find: "      // As in the view's own: kept apart, Foldkit would draw one of two `Class` lists.\n      if (isClass(inner)) {",
        replace: '      if (false as boolean) {',
      },
    ],
    tests,
  },
  {
    name: 'a Mixin may write the class and style the resolver emits',
    edits: [
      {
        file: resolver,
        find: '    if (RESOLVER_OWNED.has(attributeName)) {',
        replace: '    if (false as boolean) {',
      },
    ],
    tests,
  },
  {
    name: 'a Mixin may contribute Key or InnerHTML',
    edits: [
      {
        file: resolver,
        find: "    if (tag === 'Key' || tag === 'InnerHTML') failStructural(tag)\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a Mixin may replace the children through a Prop',
    edits: [
      {
        file: resolver,
        find: '    if (REPLACES_CHILDREN.has(attributeName)) failStructural(tag)\n',
        replace: '',
      },
    ],
    tests,
  },
]
