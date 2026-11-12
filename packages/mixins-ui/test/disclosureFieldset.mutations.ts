/**
 * The Disclosure and Fieldset recipes, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/disclosureFieldset.mutations.ts`.
 */
const disclosureUnit = ['packages/mixins-ui/test/disclosure.test.ts']
const fieldsetUnit = ['packages/mixins-ui/test/fieldset.test.ts']
const browser = ['packages/mixins-ui/test/disclosureFieldset.browser.test.ts']
const disclosure = '../src/recipes/disclosure.ts'
const fieldset = '../src/recipes/fieldset.ts'
const design = '../src/recipes/design.ts'

export default [
  {
    name: 'the panel height transition is no longer important, so the inline one wins',
    edits: [
      {
        file: disclosure,
        find: '{transition-duration:${travelled(ref.motion.fast)}!important}',
        replace: '{transition-duration:${travelled(ref.motion.fast)}}',
      },
    ],
    tests: browser,
  },
  {
    name: 'the panel height duration ignores the travel knob',
    edits: [
      {
        file: disclosure,
        find: '{transition-duration:${travelled(ref.motion.fast)}!important}',
        replace: '{transition-duration:${ref.motion.fast}!important}',
      },
    ],
    tests: browser,
  },
  {
    name: 'the panel height rule is not drawn',
    edits: [{ file: disclosure, find: '      heightTravel,\n', replace: '' }],
    tests: browser,
  },
  {
    name: 'the chevron is not drawn on the button',
    edits: [
      {
        file: disclosure,
        find: "triggerChevron(open, '0.45em', '::after')",
        replace: "triggerChevron(open, '0.45em')",
      },
    ],
    tests: [...disclosureUnit, ...browser],
  },
  {
    name: 'a pseudo-element chevron gets no content',
    edits: [{ file: design, find: "...(part === '' ? {} : { content: '\"\"' }),", replace: '' }],
    tests: [...disclosureUnit, ...browser],
  },
  {
    name: 'the open chevron rule misses the pseudo-element',
    edits: [{ file: design, find: 'Style.nest(`${open}${part}`', replace: 'Style.nest(open' }],
    tests: [...disclosureUnit, ...browser],
  },
  {
    name: 'a bordered button keeps its lower corners round while open',
    edits: [
      {
        file: disclosure,
        find: "          Style.nest(open, { borderEndStartRadius: '0', borderEndEndRadius: '0' }),\n",
        replace: '',
      },
    ],
    tests: [...disclosureUnit, ...browser],
  },
  {
    name: 'the open corners sit in the base, under the variant’s',
    edits: [
      {
        file: disclosure,
        find: '      Style.nest(open, { color: ref.text.overt }),\n',
        replace:
          "      Style.nest(open, { color: ref.text.overt, borderEndStartRadius: '0', borderEndEndRadius: '0' }),\n",
      },
      {
        file: disclosure,
        find: "          Style.nest(open, { borderEndStartRadius: '0', borderEndEndRadius: '0' }),\n",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a ghost button does not fill under the pointer',
    edits: [
      { file: disclosure, find: '          hover({ background: unfilledHover }),\n', replace: '' },
    ],
    tests: disclosureUnit,
  },
  {
    name: 'indicator none still draws the chevron',
    edits: [
      {
        file: disclosure,
        find: "  defaults: { variant: 'plain', indicator: 'chevron' },",
        replace:
          "  defaults: { variant: 'plain', indicator: 'chevron' },\n  compound: [{ when: { indicator: 'none' }, style: { button: variant(triggerChevron(open, '0.45em', '::after')) } }],",
      },
    ],
    tests: [...disclosureUnit, ...browser],
  },
  {
    name: 'the legend sits across the border',
    edits: [{ file: fieldset, find: "        float: 'inline-start',\n", replace: '' }],
    tests: [...fieldsetUnit, ...browser],
  },
  {
    name: 'a disabled fieldset does not dim its words',
    edits: [{ file: fieldset, find: "{ opacity: ref.knob['state-disabled'] }", replace: '{}' }],
    tests: [...fieldsetUnit, ...browser],
  },
  {
    name: 'the description stands a whole gap below the legend',
    edits: [
      {
        file: fieldset,
        find: "marginBlock: `calc(${ref.space['2xs']} - ${gap}) 0`",
        replace: "marginBlock: '0'",
      },
    ],
    tests: browser,
  },
  {
    name: 'a boxed group is not padded',
    edits: [{ file: fieldset, find: '      padding: pad,\n', replace: '' }],
    tests: [...fieldsetUnit, ...browser],
  },
  {
    name: 'a boxed group publishes no concentric corner',
    edits: [{ file: fieldset, find: '      ...nests(ref.radius.lg, pad, border),\n', replace: '' }],
    tests: fieldsetUnit,
  },
  {
    name: 'a filled group draws no fill',
    edits: [
      {
        file: fieldset,
        find: '      filled: boxed({ background: ref.surface.muted }),',
        replace: '      filled: boxed({}),',
      },
    ],
    tests: fieldsetUnit,
  },
]
