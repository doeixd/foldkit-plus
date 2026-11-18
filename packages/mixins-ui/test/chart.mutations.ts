/**
 * The chart, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/chart.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/chart.test.ts'
const browser = 'packages/mixins-ui/test/chart.browser.test.ts'
const source = '../src/chart.ts'
const scale = '../src/chart/scale.ts'
const cartesian = '../src/chart/cartesian.ts'
const kind = '../src/chart/kind.ts'
const recipe = '../src/recipes/chart.ts'

const one = (name: string, file: string, find: string, replace: string, tests: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests: [tests],
})

export default [
  one(
    'no step of five',
    scale,
    'if (error >= Math.sqrt(10)) return power * 5',
    'if (error >= Math.sqrt(10)) return power * 2',
    unit,
  ),
  one(
    'an axis that leaves zero out',
    scale,
    'const from = Math.min(0, low)',
    'const from = low',
    unit,
  ),
  one(
    'a top tick below the greatest value',
    scale,
    'Math.ceil(tidy(to / step))',
    'Math.floor(tidy(to / step))',
    unit,
  ),
  one(
    'values measured from the top',
    scale,
    '((top - value) / (top - bottom))',
    '((value - bottom) / (top - bottom))',
    unit,
  ),
  one(
    'bars off the middle of their band',
    scale,
    'band.start + (band.width * (1 - GROUP)) / 2 + width * series',
    'band.start + band.width * (1 - GROUP) + width * series',
    unit,
  ),
  one(
    'an area closed down to the axis floor, not to zero',
    scale,
    'Math.max(0, ticks[0] ?? 0)',
    '(ticks[0] ?? 0)',
    unit,
  ),
  one(
    'every arc the short way round',
    scale,
    'to - from > 0.5 ? 1 : 0',
    'to - from > 0.5 ? 0 : 0',
    unit,
  ),
  one(
    'a whole ring as one arc',
    scale,
    'if (value === total) return segment(0, 0.5, hole) + segment(0.5, 1, hole)',
    'if (value === -1) return ""',
    unit,
  ),
  one(
    'the pointer leaving clears what the keys lit',
    source,
    'Left: () => (model.keyed ? model : cleared(model)),',
    'Left: () => cleared(model),',
    unit,
  ),
  one(
    'from nothing lit, the left arrow begins at the start',
    source,
    "(step === 'previous' ? count : -1)",
    '-1',
    unit,
  ),
  one(
    'focus moves the light back to the first point',
    source,
    'count > 0 && Option.isNone(model.point)',
    'count > 0',
    unit,
  ),
  one(
    'lighting the point lit makes a new Model',
    source,
    'Option.contains(model.point, point) && model.keyed === keyed',
    'false',
    unit,
  ),
  one(
    'a point past the data still lights',
    source,
    'Option.filter(model.point, at => at < count)',
    'model.point',
    unit,
  ),
  one(
    'a pointer lit point said aloud',
    source,
    'return model.keyed && lit',
    'return true && lit',
    unit,
  ),
  one(
    'the tooltip always opens toward the end',
    cartesian,
    "middle > 50 ? 'start' : 'end'",
    "middle > 50 ? 'end' : 'end'",
    unit,
  ),
  one('the first series on no color', kind, '(at % COLORS) + 1', 'at % COLORS', unit),
  one(
    'a sixth series drawn',
    source,
    'if (entries.length > COLORS)',
    'if (entries.length > COLORS + 1)',
    unit,
  ),
  one(
    'a legend for a single series',
    source,
    'kind.alwaysLegend === true || entries.length > 1',
    'kind.alwaysLegend === true || entries.length > 0',
    unit,
  ),
  one('the up arrow does nothing', source, "case 'ArrowUp':", "case 'Up':", unit),
  one(
    'the table shown by default',
    source,
    "String(options.table === 'shown')",
    "String(options.table !== 'hidden')",
    unit,
  ),
  one(
    'focus lights nothing',
    source,
    'h.OnFocus(onMessage(Message.Focused({ count }))),',
    'h.OnFocus(onMessage(Message.Cleared())),',
    browser,
  ),
  one(
    'a blur leaves the keys lit point lit',
    source,
    'h.OnBlur(onMessage(Message.Cleared())),',
    'h.OnBlur(onMessage(Message.Left())),',
    browser,
  ),
  one(
    'nothing dims beside the lit point',
    recipe,
    "fillOpacity: '0.45',",
    "fillOpacity: '1',",
    browser,
  ),
  one(
    'every category label on a narrow chart',
    recipe,
    "Style.pseudo('[data-minor=\"true\"]', { visibility: 'hidden' })",
    "Style.pseudo('[data-minor=\"true\"]', { visibility: 'visible' })",
    browser,
  ),
  one(
    'a value label below its gridline',
    recipe,
    "translate: '0 -50%',",
    "translate: '0',",
    browser,
  ),
  one(
    'every category label at the plot start',
    recipe,
    "does not flip right to left.\n        left: 'var(--_fk-chart-at)',",
    "does not flip right to left.\n        left: '0',",
    browser,
  ),
  one(
    'a tooltip past the middle opening off the plot',
    recipe,
    'Style.pseudo(\'[data-side="start"]\', { translate: `calc(-100% - ${ref.space.sm}) 0` }),',
    '',
    browser,
  ),
  one(
    'stacked bars drawn side by side',
    '../src/chart/bars.ts',
    'const edges = data.stack === true ?',
    'const edges = false ?',
    unit,
  ),
  one(
    'a stacked axis that stops at the tallest bar',
    '../src/chart/bars.ts',
    'data.stack === true ? stackedSpanOf(data) : spanOf(data)',
    'spanOf(data)',
    unit,
  ),
  one(
    'a stacked area that falls to zero',
    '../src/chart/paths.ts',
    'edges?.[place]?.map(([from]) => from)',
    'undefined',
    unit,
  ),
  one(
    'a step curve drawn straight',
    scale,
    "return curve === 'step' ? `H${x}V${ys[at]}`",
    "return curve === 'never' ? `H${x}V${ys[at]}`",
    unit,
  ),
  one(
    'a stepped area closed along a straight edge',
    scale,
    "path += curve === 'step' ?",
    "path += curve === 'never' ?",
    unit,
  ),
  one(
    'markers always on only the lit point',
    '../src/chart/paths.ts',
    "data.markers === 'always'",
    "data.markers === 'never'",
    unit,
  ),
  one('a pie drawn with a ring hole', scale, 'hole === 0\n', 'hole === -1\n', unit),
  one(
    'a pie with a total in it',
    '../src/chart/donut.ts',
    '...(hole === 0',
    '...(hole === -1',
    unit,
  ),
  one(
    'a hole past the ring accepted',
    '../src/chart/donut.ts',
    'if (!(hole >= 0 && hole < 1))',
    'if (false)',
    unit,
  ),
  one('a kind that draws nothing', source, '...kind.draw(options, frame),', '...[],', unit),
]
