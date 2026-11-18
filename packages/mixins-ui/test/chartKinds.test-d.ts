import { Chart } from '../src/index.js'
import { h, message, type TestMessage } from './fixture.js'

const common = { id: 'c', label: 'Sales', model: Chart.init(), onMessage: () => message('Clicked') }
const categories = ['Jan', 'Feb']
const series = [{ name: 'Desktop', values: [1, 2] }]

// Accepted: each kind with the options it reads.
Chart.view<TestMessage, Chart.BarsData>(
  { ...common, kind: Chart.bars, categories, series, stack: true },
  h,
)
Chart.view<TestMessage, Chart.PathsData>(
  { ...common, kind: Chart.line, categories, series, curve: 'step', markers: 'always' },
  h,
)
Chart.view<TestMessage, Chart.AreaData>(
  { ...common, kind: Chart.area, categories, series, stack: true, curve: 'step' },
  h,
)
Chart.view<TestMessage, Chart.DonutData>(
  { ...common, kind: Chart.donut, slices: [{ name: 'A', value: 1 }], hole: 0 },
  h,
)
Chart.view({ ...common, kind: Chart.bars, categories, series }, h)

// A line does not stack.
// @ts-expect-error `stack` is the bars' and the area's option
Chart.view({ ...common, kind: Chart.line, categories, series, stack: true }, h)

// A kind is a value, not a name.
// @ts-expect-error a string no longer picks the kind
Chart.view({ ...common, kind: 'bar', categories, series }, h)

// A kind reads its own data: slices do not draw bars.
// @ts-expect-error `categories` is missing
Chart.view({ ...common, kind: Chart.bars, slices: [{ name: 'A', value: 1 }] }, h)

// The curve is one of two.
// @ts-expect-error `smooth` is not a curve
Chart.view({ ...common, kind: Chart.line, categories, series, curve: 'smooth' }, h)
