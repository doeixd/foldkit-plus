/**
 * A chart: thin marks in the `chart` colors over recessive gridlines, the
 * axes' labels in the muted text, and a tooltip on the popup's surface. Every
 * mark takes its color from `data-color` (1 to 5) as `--_fk-chart-ink`, so a
 * stylist recolors a series in one place. While a point is lit the other
 * bars and slices dim, so the lit one reads first. Below 30rem of its own
 * width every other category label hides, so the rest keep room. `height`
 * sets the plot's, `grid` draws the gridlines or only the zero line, and
 * `indicator` draws a series' mark in the legend and tooltip as a dot or a
 * line, as shadcn's tooltip does.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
import { ChartSlots } from '../chart.js'
import { component, focusRing, ref, transition, variant } from './design.js'

const ink = 'var(--_fk-chart-ink)'

/** Each series' color by its `data-color`. */
const inked: StyleValue = Style.compose(
  ...(['1', '2', '3', '4', '5'] as const).map(n =>
    Style.pseudo(`[data-color="${n}"]`, { '--_fk-chart-ink': ref.chart[n] }),
  ),
)

/** Unlit while another point is lit. */
const dimmed: StyleValue = Style.nest(':where([data-pointed="true"]) &[data-active="false"]', {
  fillOpacity: '0.45',
})

const caption = { ...role('caption'), color: ref.text.muted }

export const Chart = Style.recipeFor(ChartSlots)({
  base: {
    root: component(
      Style.self({
        display: 'grid',
        gap: ref.space.sm,
        margin: '0',
        minInlineSize: '0',
        color: ref.text.default,
        containerType: 'inline-size',
        containerName: 'chart',
        '--_fk-chart-height': '14rem',
      }),
    ),
    title: component(Style.self({ ...role('body'), fontWeight: ref.weight.semibold })),
    description: component(Style.self({ ...caption, margin: '0' })),
    legend: component(
      Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        gap: `${ref.space['2xs']} ${ref.space.md}`,
        margin: '0',
        padding: '0',
        listStyle: 'none',
      }),
    ),
    legendItem: component(
      Style.self({ ...caption, display: 'inline-flex', alignItems: 'center', gap: ref.space.xs }),
    ),
    swatch: component(
      Style.self({
        flex: 'none',
        inlineSize: '0.625rem',
        blockSize: '0.625rem',
        borderRadius: ref.radius.xs,
        background: ink,
      }),
      inked,
    ),
    body: component(
      Style.self({
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gridTemplateRows: 'var(--_fk-chart-height) auto',
        columnGap: ref.space.xs,
        // Half a line above the plot, for the top tick's label to sit centred on its line.
        paddingBlockStart: '0.5lh',
        ...role('caption'),
      }),
    ),
    yAxis: component(
      Style.self({
        ...caption,
        position: 'relative',
        inlineSize: 'calc(var(--_fk-chart-label-ch) * 1ch)',
        fontVariantNumeric: 'tabular-nums',
      }),
    ),
    yTick: component(
      Style.self({
        position: 'absolute',
        insetInlineEnd: '0',
        top: 'var(--_fk-chart-at)',
        translate: '0 -50%',
        lineHeight: '1',
        whiteSpace: 'nowrap',
      }),
    ),
    xAxis: component(
      Style.self({
        ...caption,
        gridColumn: '2',
        position: 'relative',
        blockSize: `calc(1lh + ${ref.space['2xs']})`,
      }),
    ),
    xTick: component(
      Style.self({
        position: 'absolute',
        // Physical, as the drawing is: a category's band does not flip right to left.
        left: 'var(--_fk-chart-at)',
        top: ref.space['2xs'],
        inlineSize: 'var(--_fk-chart-band)',
        textAlign: 'center',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }),
      Style.at(
        '@container chart (max-width: 30rem)',
        Style.pseudo('[data-minor="true"]', { visibility: 'hidden' }),
      ),
    ),
    plot: component(
      Style.self({ position: 'relative', minInlineSize: '0', borderRadius: ref.radius.sm }),
      Style.pseudo('[data-kind="donut"]', {
        inlineSize: 'min(16rem, 100%)',
        aspectRatio: '1',
        justifySelf: 'center',
      }),
      focusRing,
    ),
    canvas: component(
      Style.self({ display: 'block', inlineSize: '100%', blockSize: '100%', overflow: 'visible' }),
    ),
    paths: component(Style.self({ overflow: 'visible' })),
    grid: component(
      Style.self({ stroke: ref.outline.subtle, strokeWidth: '1', shapeRendering: 'crispEdges' }),
      Style.pseudo('[data-zero="true"]', { stroke: ref.outline.default }),
    ),
    cursor: component(Style.self({ fill: ref.state.tint })),
    bar: component(Style.self({ fill: ink, ...transition('fill-opacity') }), inked, dimmed),
    line: component(
      Style.self({
        fill: 'none',
        stroke: ink,
        strokeWidth: '2',
        strokeLinejoin: 'round',
        strokeLinecap: 'round',
      }),
      inked,
    ),
    area: component(Style.self({ fill: ink, fillOpacity: '0.22', stroke: 'none' }), inked),
    dot: component(Style.self({ fill: ink, stroke: ref.surface.base, strokeWidth: '2' }), inked),
    slice: component(
      Style.self({
        fill: ink,
        // A gap of the page between slices, as wide at any size.
        stroke: ref.surface.base,
        strokeWidth: '2',
        ...transition('fill-opacity'),
      }),
      inked,
      dimmed,
    ),
    band: component(Style.self({ fill: 'transparent' })),
    center: component(
      Style.self({
        position: 'absolute',
        inset: '0',
        display: 'grid',
        placeContent: 'center',
        textAlign: 'center',
        pointerEvents: 'none',
      }),
    ),
    centerValue: component(
      Style.self({
        ...role('title'),
        fontWeight: ref.weight.semibold,
        fontVariantNumeric: 'tabular-nums',
      }),
    ),
    centerLabel: component(Style.self(caption)),
    tooltip: component(
      Style.self({
        ...role('caption'),
        position: 'absolute',
        insetBlockStart: ref.space.xs,
        left: 'var(--_fk-chart-at)',
        zIndex: '1',
        display: 'grid',
        gap: ref.space['3xs'],
        minInlineSize: '8rem',
        padding: `${ref.space.xs} ${ref.space.sm}`,
        borderRadius: ref.radius.md,
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        background: ref.popup.surface,
        color: ref.popup.ink,
        boxShadow: ref.shadow.md,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }),
      Style.pseudo('[data-side="end"]', { translate: `${ref.space.sm} 0` }),
      Style.pseudo('[data-side="start"]', { translate: `calc(-100% - ${ref.space.sm}) 0` }),
    ),
    tooltipLabel: component(Style.self({ fontWeight: ref.weight.semibold })),
    tooltipRow: component(
      Style.self({
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        gap: ref.space.xs,
      }),
    ),
    tooltipName: component(Style.self({ color: ref.text.muted })),
    tooltipValue: component(
      Style.self({ fontWeight: ref.weight.medium, fontVariantNumeric: 'tabular-nums' }),
    ),
    status: component(Utilities.srOnly),
    table: component(
      Style.self({ ...role('caption'), borderCollapse: 'collapse', inlineSize: '100%' }),
      Style.pseudo('[data-shown="false"]', {
        position: 'absolute',
        inlineSize: '1px',
        blockSize: '1px',
        overflow: 'hidden',
        clipPath: 'inset(50%)',
        whiteSpace: 'nowrap',
      }),
    ),
    // The figure's caption names the chart already, for the eye.
    tableCaption: component(Utilities.srOnly),
    tableHeader: component(
      Style.self({
        padding: `${ref.space['2xs']} ${ref.space.xs}`,
        borderBlockEnd: `${ref.border.thin} solid ${ref.outline.subtle}`,
        textAlign: 'start',
        fontWeight: ref.weight.medium,
      }),
    ),
    tableCell: component(
      Style.self({
        padding: `${ref.space['2xs']} ${ref.space.xs}`,
        borderBlockEnd: `${ref.border.thin} solid ${ref.outline.subtle}`,
        textAlign: 'end',
        fontVariantNumeric: 'tabular-nums',
      }),
    ),
  },
  variants: {
    height: {
      sm: { root: variant(Style.self({ '--_fk-chart-height': '10rem' })) },
      md: { root: variant(Style.self({ '--_fk-chart-height': '14rem' })) },
      lg: { root: variant(Style.self({ '--_fk-chart-height': '18rem' })) },
    },
    grid: {
      lines: {},
      zero: { grid: variant(Style.pseudo('[data-zero="false"]', { display: 'none' })) },
    },
    indicator: {
      dot: {},
      line: {
        swatch: variant(Style.self({ inlineSize: '0.25rem', blockSize: '0.875rem' })),
      },
    },
  },
  defaults: { grid: 'lines', indicator: 'dot' },
})
