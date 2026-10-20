/**
 * Card and CardGroup, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/card.mutations.ts` checks that a test
 * fails for every one.
 */
const unit = ['packages/mixins-ui/test/card.test.ts']
const browser = ['packages/mixins-ui/test/card.browser.test.ts']
const elevation = ['packages/mixins-ui/test/cardElevation.browser.test.ts']
const group = ['packages/mixins-ui/test/cardGroup.browser.test.ts']
const view = '../src/card.ts'
const recipe = '../src/recipes/card.ts'

export default [
  {
    name: 'the outlined card loses its surface',
    edits: [
      {
        file: recipe,
        find: '          Style.self({\n            background: raisedSurface(),\n            border:',
        replace:
          '          Style.self({\n            background: ref.surface.muted,\n            border:',
      },
    ],
    tests: unit,
  },
  {
    name: 'cards default to flush padding',
    edits: [
      {
        file: recipe,
        find: "    padding: 'comfortable',\n    elevation: '1',",
        replace: "    padding: 'flush',\n    elevation: '1',",
      },
    ],
    tests: unit,
  },
  {
    name: 'the overlay covers only its own box',
    edits: [
      {
        file: recipe,
        find: "        position: 'absolute',\n        inset: '0',\n        margin: '0',",
        replace: "        margin: '0',",
      },
    ],
    tests: browser,
  },
  {
    name: 'the action sits under the overlay',
    edits: [
      {
        file: recipe,
        find: "        gridRow: '1 / span 2',\n        position: 'relative',\n        zIndex: '1',\n        display: 'flex',",
        replace: "        gridRow: '1 / span 2',\n        display: 'flex',",
      },
    ],
    tests: browser,
  },
  {
    name: 'the dismiss button is always shown',
    edits: [
      {
        file: recipe,
        find: "      Style.nest('&[data-reveal=\"hover\"]', { opacity: '0' }),\n",
        replace: '',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'the dismiss button is never revealed by touch',
    edits: [
      {
        file: recipe,
        find: "      Style.media('(hover: none)', { opacity: '1' }),\n",
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'a disabled card still sends its Message',
    edits: [
      {
        file: view,
        find: '...(state.disabled ? [h.Disabled(true)] : [h.OnClick(press.onClick)]),',
        replace: '...[h.OnClick(press.onClick)],',
      },
    ],
    tests: unit,
  },
  {
    name: 'a disabled link still goes somewhere',
    edits: [
      {
        file: view,
        find: '...(state.disabled\n          ? [h.AriaDisabled(true)]\n          : [',
        replace: '...(false\n          ? [h.AriaDisabled(true)]\n          : [',
      },
    ],
    tests: unit,
  },
  {
    name: 'the label is ignored',
    edits: [
      {
        file: view,
        find: 'const name = options.label ?? options.title',
        replace: 'const name = options.title ?? options.label',
      },
    ],
    tests: unit,
  },
  {
    name: 'a pressable card with no name is drawn nameless',
    edits: [
      {
        file: view,
        find: '  if (press !== undefined && name === undefined) {\n',
        replace: '  if (false) {\n',
      },
    ],
    tests: unit,
  },
  {
    name: 'an external link opens in this tab',
    edits: [
      {
        file: view,
        find: "...(external ? [h.Target('_blank'), h.Rel('noopener noreferrer')] : []),",
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'a chosen button is not pressed',
    edits: [{ file: view, find: '[h.AriaPressed(flag(state.selected))]', replace: '[]' }],
    tests: unit,
  },
  {
    name: 'a group does not say whether it draws its highlight',
    edits: [{ file: view, find: "h.DataAttribute('card-fluid', flag(fluid)),", replace: '' }],
    tests: unit,
  },
  {
    name: 'a grid never wraps',
    edits: [
      {
        file: recipe,
        find: 'minmax(max(min(100%, ${minColumn}), calc(',
        replace: 'minmax(max(0px, calc(',
      },
    ],
    tests: group,
  },
  {
    name: 'a grid takes no wider than one column at its narrowest',
    edits: [
      { file: recipe, find: '        minInlineSize: `min(100%, ${narrowest})`,\n', replace: '' },
    ],
    tests: group,
  },
  {
    name: "a divided grid draws its first row's and column's lines",
    edits: [
      {
        file: recipe,
        find: "        list: variant(Style.self({ overflow: 'clip' })),\n",
        replace: '',
      },
    ],
    tests: group,
  },
  {
    name: 'a divided grid draws two lines between cards',
    edits: [
      {
        file: recipe,
        find: '            marginBlockStart: `calc(-1 * ${ref.border.thin})`,\n            marginInlineStart: `calc(-1 * ${ref.border.thin})`,\n',
        replace: '',
      },
    ],
    tests: group,
  },
  {
    name: 'the highlight reaches half the gap past the card',
    edits: [
      {
        file: recipe,
        find: "inlineSize: 'var(--fk-card-hover-w)',",
        replace: 'inlineSize: `calc(var(--fk-card-hover-w) + ${groupGap})`,',
      },
    ],
    tests: group,
  },
  {
    name: 'the highlight lies under the cards, hidden by their surface',
    edits: [
      {
        file: recipe,
        find: "        // showed only as a rim in the gap around it.\n        zIndex: '1',\n",
        replace: '        // showed only as a rim in the gap around it.\n',
      },
    ],
    tests: group,
  },
  {
    name: "a card's footer stands over the highlight",
    edits: [
      {
        file: recipe,
        find: "Style.self({ position: 'relative', zIndex: '0', display: 'grid' })",
        replace: "Style.self({ position: 'relative', display: 'grid' })",
      },
    ],
    tests: group,
  },
  {
    name: "an outlined card lifts under the group's highlight too",
    edits: [
      {
        file: recipe,
        find: "Style.nest(ownHover, {\n            boxShadow: 'var(--_fk-card-shadow-quiet-lifted)',",
        replace:
          "Style.nest(pressableHover, {\n            boxShadow: 'var(--_fk-card-shadow-quiet-lifted)',",
      },
    ],
    tests: group,
  },
  {
    name: 'a plain card never hovers by itself',
    edits: [
      {
        file: recipe,
        find: "          Style.nest(ownHover, { background: film('transparent', '0.5') }),\n",
        replace: '',
      },
    ],
    tests: group,
  },
  {
    name: "a card hovers under the group's highlight too",
    edits: [
      {
        file: recipe,
        find: 'const ownHover = `${pressableHover}:not([data-card-fluid="true"] [data-card-item] > *)`',
        replace: 'const ownHover = pressableHover',
      },
    ],
    tests: group,
  },
  {
    name: 'a grid reads nearness down only',
    edits: [{ file: view, find: "axis: columns > 1 ? 'xy' : 'y',", replace: "axis: 'y'," }],
    tests: unit,
  },
  {
    name: "a group's card style is ignored",
    edits: [
      { file: view, find: 'style: card.style ?? options.cardStyle', replace: 'style: card.style' },
    ],
    tests: unit,
  },
  {
    name: 'the highlight is not drawn',
    edits: [
      {
        file: view,
        find: '      ...(fluid ? [h.div(builders.highlight.attrs([h.AriaHidden(true)]), [])] : []),\n',
        replace: '',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'columns are not checked',
    edits: [
      {
        file: view,
        find: '  if (!Number.isInteger(columns) || columns < 1) {',
        replace: '  if (false) {',
      },
    ],
    tests: unit,
  },
  {
    name: 'the action runs under the dismiss button',
    edits: [
      {
        file: recipe,
        find: 'Style.nest(\':where([data-dismissible="true"]) > &:first-child\', {',
        replace: 'Style.nest(\':where([data-dismissible="never"]) > &\', {',
      },
    ],
    tests: browser,
  },
  {
    name: 'a chosen plain card loses its fill',
    edits: [
      {
        file: recipe,
        find: "          Style.nest(selected, { background: film('transparent', '1') }),\n",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a chosen plain card is a surface step, sunken on a dark page',
    edits: [
      {
        file: recipe,
        find: "Style.nest(selected, { background: film('transparent', '1') }),",
        replace: 'Style.nest(selected, { background: ref.surface.muted }),',
      },
    ],
    tests: elevation,
  },
  {
    name: "the group's highlight is a surface step",
    edits: [
      {
        file: recipe,
        find: "background: film('transparent', '0.5'),",
        replace: 'background: ref.surface.subtle,',
      },
    ],
    tests: elevation,
  },
  {
    name: 'an elevated card stands on the page, at every level',
    edits: [
      {
        file: recipe,
        find: "Style.self({ background: raisedSurface(), boxShadow: 'var(--_fk-card-shadow)' }),",
        replace:
          "Style.self({ background: ref.surface.base, boxShadow: 'var(--_fk-card-shadow)' }),",
      },
    ],
    tests: elevation,
  },
  {
    name: 'every level is one above the page',
    edits: [{ file: recipe, find: '    raise(offset),\n', replace: '    raise(1),\n' }],
    tests: elevation,
  },
  {
    name: 'an elevated card casts one layer of shadow',
    edits: [
      {
        file: recipe,
        find: "'1': { root: level(1, [ref.shadow.xs, ref.shadow.md, ref.shadow.sm, ref.shadow.lg]) },",
        replace:
          "'1': { root: level(1, [ref.shadow.xs, ref.shadow.xs, ref.shadow.sm, ref.shadow.lg]) },",
      },
    ],
    tests: elevation,
  },
  {
    name: 'a lifted card does not rise',
    edits: [
      {
        file: recipe,
        find: "translate: `0 calc(-1 * ${ref.space['3xs']} * ${ref.knob.travel})`,",
        replace: "translate: '0 0',",
      },
    ],
    tests: elevation,
  },
  {
    name: 'a lifted card rises under reduced motion',
    edits: [
      {
        file: recipe,
        find: "translate: `0 calc(-1 * ${ref.space['3xs']} * ${ref.knob.travel})`,",
        replace: "translate: `0 calc(-1 * ${ref.space['3xs']})`,",
      },
    ],
    tests: elevation,
  },
  {
    name: "the action's badge sits at the top of a taller box",
    edits: [
      {
        file: recipe,
        find: "        alignItems: 'center',\n        minBlockSize: role('subtitle').lineHeight,\n",
        replace: '',
      },
    ],
    tests: elevation,
  },
  {
    name: 'a header below a media tile still keeps clear of the corner',
    edits: [
      {
        file: recipe,
        find: 'Style.nest(\':where([data-dismissible="true"]) > &:first-child\', {',
        replace: 'Style.nest(\':where([data-dismissible="true"]) > &\', {',
      },
    ],
    tests: elevation,
  },
  {
    name: 'every media is an icon tile, an avatar clipped in it',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo(':has(> :is(svg, img))', {",
        replace: "Style.pseudo('', {",
      },
    ],
    tests: browser,
  },
  {
    name: 'media is stretched across a stacked card',
    edits: [
      {
        file: recipe,
        find: "        media: variant(Style.self({ alignSelf: 'flex-start' })),\n",
        replace: '',
      },
    ],
    tests: browser,
  },
]
