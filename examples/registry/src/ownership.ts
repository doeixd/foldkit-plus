/**
 * "How this page works": who owns each part of the Model, read from the
 * contracts that claim it (`Module.manifest`), and what each part holds now.
 * The sections are the manifest's owners, not a list typed here, so a field
 * no contract claims shows as the page's own, and a field nobody describes
 * does not compile.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { GridWindow } from 'foldkit-data-grid'
import type { ModuleManifest } from 'foldkit-surface'
import { Data, Grid, type Message, type Model } from './app.js'
import type { EditedColumn } from './domain.js'
import { hairline, muted } from './palette.js'

const cellName = ({ id, member }: { readonly id: string; readonly member: EditedColumn }) =>
  `${Grid.columns.byId[member].header} of ${id}`
const counted = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`

// Remote's cache changes only when a read lands, so it is counted once per slice.
const cacheFacts = new WeakMap<Model['remote'], string>()
const cacheOf = (model: Model): string => {
  const known = cacheFacts.get(model.remote)
  if (known !== undefined) return known
  const cache = Data.inspect(model)
  const fact = [
    counted(cache.entities.length, 'product'),
    counted(cache.connections.length, 'page list'),
    `${counted(cache.loading.length, 'read')} in flight`,
  ].join(' cached · ')
  cacheFacts.set(model.remote, fact)
  return fact
}

/** What each field holds now, in a line. Every field says, so a new one cannot be missed. */
const facts = (
  model: Model,
  shown: GridWindow<string>,
): { readonly [Field in keyof Model]: string } => {
  const pending = model.edits.filter(edit => Option.isNone(edit.at))
  const focus = model.grid.focus.current
  return {
    remote: cacheOf(model),
    edits:
      model.edits.length === 0
        ? 'No edits the table has not written'
        : `${counted(pending.length, 'edit')} not yet sent${pending.length === 0 ? '' : ` (${pending.map(cellName).join(', ')})`} · ${counted(model.edits.length - pending.length, 'committed edit')} not yet in the table`,
    grid: [
      Option.match(focus, {
        onNone: () => 'No cell focused',
        onSome: ({ row, column }) => `Focus on ${column} of ${row}`,
      }),
      Option.isSome(model.grid.editing) ? 'an editor open' : 'no editor open',
      `rows ${(shown.rows.start + 1).toLocaleString()} to ${shown.rows.end.toLocaleString()} drawn`,
    ].join(' · '),
    search: model.search === '' ? 'Every product' : `Descriptions holding “${model.search}”`,
    sort:
      model.sort === null
        ? 'In the server’s own order'
        : `By ${model.sort.by}, ${model.sort.direction === 'asc' ? 'ascending' : 'descending'}`,
    exchange: `${counted(model.exchange.pending, 'edit')} waiting for the server`,
    refused: counted(model.refused.length, 'refused cell'),
    replaced: counted(model.replaced.length, 'replaced cell'),
    offline: model.offline ? 'Working offline' : 'Online',
    peers: counted(model.peers.length, 'other device'),
    replica: `Replica ${model.replica}`,
    undo: `${counted(model.undo.length, 'step')} to undo`,
    redo: `${counted(model.redo.length, 'step')} to redo`,
    heldBack: Option.match(model.heldBack, {
      onNone: () => 'Nothing left alone',
      onSome: ({ cells }) => `${counted(cells.length, 'cell')} left alone`,
    }),
  }
}

/** An owner as the manifest names it, or the page itself for a field no contract claims. */
const ownerName = (owner: ModuleManifest['ownership'][number]['owner']): string =>
  owner === undefined
    ? 'This page'
    : `${owner.kind.charAt(0).toUpperCase()}${owner.kind.slice(1)} · ${owner.name}`

const isField = (model: Model, path: ReadonlyArray<string>): path is readonly [keyof Model] =>
  path.length === 1 && Object.hasOwn(model, path[0]!)

/** The panel: one section per owner, in the order the manifest lists their fields. */
export const ownershipPanel = (
  manifest: ModuleManifest,
  model: Model,
  shown: GridWindow<string>,
  h: HtmlBuilder<Message>,
): Html => {
  const now = facts(model, shown)
  const sections = new Map<string, Array<keyof Model>>()
  for (const { path, owner } of manifest.ownership) {
    if (!isField(model, path)) continue
    const name = ownerName(owner)
    sections.set(name, [...(sections.get(name) ?? []), path[0]])
  }
  return h.details(
    [
      h.Id('ownership'),
      h.Style({
        border: `1px solid ${hairline}`,
        borderRadius: '8px',
        padding: '0.5rem 0.75rem',
        fontSize: '0.8125rem',
      }),
    ],
    [
      h.summary([h.Style({ cursor: 'pointer', fontWeight: '500' })], ['How this page works']),
      h.div(
        [
          h.Style({
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))',
            gap: '0.75rem 1.5rem',
            paddingBlockStart: '0.5rem',
          }),
        ],
        [...sections].map(([owner, fields]) =>
          h.section(
            [h.AriaLabel(owner)],
            [
              h.h2(
                [h.Style({ margin: '0 0 0.25rem', fontSize: 'inherit', fontWeight: '600' })],
                [owner],
              ),
              h.dl(
                [
                  h.Style({
                    display: 'grid',
                    gridTemplateColumns: 'max-content 1fr',
                    gap: '0.125rem 0.75rem',
                    margin: '0',
                  }),
                ],
                fields.flatMap(field => [
                  h.dt([h.Style({ color: muted, fontFamily: 'ui-monospace, monospace' })], [field]),
                  h.dd([h.Style({ margin: '0' })], [now[field]]),
                ]),
              ),
            ],
          ),
        ),
      ),
    ],
  )
}
