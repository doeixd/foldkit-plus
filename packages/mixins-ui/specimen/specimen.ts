/**
 * A specimen of the shipped defaults: `Theme.oklch`'s palette and surfaces,
 * plain HTML under `Defaults`, and every recipe in every variant and state,
 * on one static page, for looking at the design whole while changing it:
 * `pnpm --filter foldkit-mixins-ui specimen <out.html> [hue]`, then open the
 * page in a light and a dark scheme.
 */
import { writeFileSync } from 'node:fs'
import { Layers, Style, type StyleValue } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import {
  ButtonSlots,
  CheckboxSlots,
  DialogSlots,
  InputSlots,
  Recipes,
  SegmentedSlots,
  SwitchSlots,
  TabsSlots,
  TextareaSlots,
} from '../src/index.js'

const [, , out = 'specimen.html', hue = '265'] = process.argv
const theme = Theme.compose(
  Theme.tokens,
  Theme.oklch({ accent: { h: Number(hue), c: 0.16, l: '52%' } }),
)
const sheets: Array<string> = []

/** The classes of each slot of a recipe's pieces; their CSS is kept for the page. */
const classesOf = (
  slots: Readonly<Record<string, unknown>>,
  pieces: Readonly<Record<string, StyleValue>>,
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(pieces).map(([key, piece]) => {
      const one = Style.forSlots(slots as never)({ [key]: piece } as never) as {
        readonly css: string
        readonly globalCss: string
        readonly rules: ReadonlyArray<{ readonly className: string }>
      }
      sheets.push(one.css, one.globalCss)
      return [key, [...piece.classes, ...one.rules.map(rule => rule.className)].join(' ')]
    }),
  )

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const section = (title: string, body: string) =>
  `<section><h2 class="spec-title">${esc(title)}</h2>${body}</section>`
const row = (...cells: ReadonlyArray<string>) => `<div class="spec-row">${cells.join('')}</div>`
const label = (text: string) => `<span class="spec-label">${esc(text)}</span>`

const swatches = (group: string, names: ReadonlyArray<string>) =>
  row(
    label(group),
    ...names.map(
      name =>
        `<span class="spec-inline"><span class="spec-swatch" style="background:var(--fk-${group}-${name})"></span>${label(name)}</span>`,
    ),
  )

const palette = section(
  'Palette',
  [
    swatches('surface', ['bedrock', 'base', 'subtle', 'muted', 'default', 'overt']),
    swatches('outline', ['subtle', 'default', 'overt', 'focus']),
    ...['accent', 'secondary', 'tertiary', 'success', 'warning', 'error', 'info'].map(family =>
      swatches(family, ['subtle', 'default', 'hover', 'outline', 'ink']),
    ),
    row(
      label('text'),
      ...['overt', 'default', 'muted', 'subtle', 'link'].map(
        name => `<span style="color:var(--fk-text-${name})">${name} Aa</span>`,
      ),
    ),
  ].join(''),
)

const plain = section(
  'Plain HTML under Defaults',
  `<h1>Heading one</h1><h2>Heading two</h2><h3>Heading three</h3><h4>Heading four</h4>
  <p>Running text with <a href="#">a link</a>, <code>inline code</code>, <kbd>Ctrl</kbd> and <strong>strong</strong> words. A paragraph long enough to wrap shows the measure and the leading of body text as a reader meets it.</p>
  <pre><code>const theme = Theme.oklch({ accent: { h: 265 } })</code></pre>
  ${row('<input placeholder="A text input">', '<select><option>A select</option></select>', '<button>A button</button>', '<button disabled>Disabled</button>')}
  <textarea placeholder="A textarea"></textarea>`,
)

const button = (selection: Parameters<typeof Recipes.Button>[0]) =>
  classesOf(ButtonSlots, Recipes.Button(selection))['button']

const buttons = section(
  'Recipes.Button',
  (['accent', 'neutral', 'danger'] as const)
    .map(tone =>
      row(
        label(tone),
        ...(['solid', 'outline', 'ghost'] as const).map(
          variant => `<button class="${button({ tone, variant })}">${variant}</button>`,
        ),
        `<button class="${button({ tone })}" disabled>disabled</button>`,
      ),
    )
    .join('') +
    row(
      label('primary'),
      ...(['sm', 'md', 'lg'] as const).map(
        size => `<button class="${button({ variant: 'primary', size })}">primary ${size}</button>`,
      ),
      `<button class="${button({ variant: 'icon' })}" aria-label="More">⋯</button>`,
    ),
)

const field = (variant: 'outline' | 'filled') => {
  const c = classesOf(InputSlots, Recipes.Input({ variant }))
  const a = classesOf(TextareaSlots, Recipes.Textarea({ variant }))
  return row(
    `<label class="spec-stack"><span class="${c['label']}">Title (${variant})</span><input class="${c['input']}" placeholder="Placeholder"><span class="${c['description']}">Help under the field.</span></label>`,
    `<label class="spec-stack"><span class="${c['label']}">Invalid</span><input class="${c['input']}" aria-invalid="true" value="Not right"></label>`,
    `<label class="spec-stack"><span class="${a['label']}">Body</span><textarea class="${a['textarea']}">Some text</textarea></label>`,
  )
}
const group = classesOf({ group: {}, affix: {}, control: {} }, Recipes.InputGroup)
const fields = section(
  'Recipes.Input, Textarea, InputGroup',
  field('outline') +
    field('filled') +
    row(
      `<div class="${group['group']}"><span class="${group['affix']}">/</span><input class="${group['control']}" value="about"></div>`,
    ),
)

const toggles = section(
  'Recipes.Checkbox, Switch',
  (['accent', 'neutral'] as const)
    .map(tone => {
      const box = classesOf(CheckboxSlots, Recipes.Checkbox({ tone }))
      const toggle = classesOf(SwitchSlots, Recipes.Switch({ tone }))
      return row(
        label(tone),
        ...['false', 'true', 'mixed'].map(
          state =>
            `<span class="spec-inline"><button role="checkbox" aria-checked="${state}" class="${box['checkbox']}"></button><span class="${box['label']}">${state}</span></span>`,
        ),
        ...['false', 'true'].map(
          state =>
            `<span class="spec-inline"><button role="switch" aria-checked="${state}" class="${toggle['button']}"></button><span class="${toggle['label']}">${state}</span></span>`,
        ),
      )
    })
    .join(''),
)

const tabs = section(
  'Recipes.Tabs, Segmented',
  (['line', 'pill'] as const)
    .map(variant => {
      const c = classesOf(TabsSlots, Recipes.Tabs({ variant }))
      return row(
        label(variant),
        `<div role="tablist" class="${c['tablist']}">${['Overview', 'Activity', 'Settings']
          .map(
            (name, i) =>
              `<button role="tab" aria-selected="${i === 0}" class="${c['tab']}">${name}</button>`,
          )
          .join('')}</div>`,
      )
    })
    .join('') +
    (['tray', 'plain'] as const)
      .map(tray => {
        const c = classesOf(SegmentedSlots, Recipes.Segmented({ tray }))
        return row(
          label(`segmented ${tray}`),
          `<div role="group" class="${c['group']}">${['Day', 'Week', 'Month']
            .map(
              (name, i) =>
                `<button aria-pressed="${i === 1}" class="${c['option']}">${name}</button>`,
            )
            .join('')}</div>`,
        )
      })
      .join(''),
)

const badge = classesOf(
  { badge: {} },
  Recipes.Badge({
    attribute: 'data-state',
    tones: { ok: 'success', warn: 'warning', info: 'info', bad: 'error' },
  }),
)['badge']
const badges = section(
  'Recipes.Badge',
  row(
    ...['plain', 'ok', 'warn', 'info', 'bad'].map(
      state => `<span class="${badge}" data-state="${state}">${state}</span>`,
    ),
  ),
)

const dialog = classesOf(DialogSlots, Recipes.Dialog({}))
const dialogs = section(
  'Recipes.Dialog (its panel, in place)',
  `<div class="${dialog['panel']}" style="position:static;transform:none;max-inline-size:28rem"><h2 class="${dialog['title']}">Delete this page?</h2><p class="${dialog['description']}">It goes for good, with its history.</p>${row(`<button class="${button({ tone: 'danger' })}">Delete</button>`, `<button class="${button({ tone: 'neutral', variant: 'ghost' })}">Cancel</button>`)}</div>`,
)

const L = Layers.standard
const css =
  Style.stylesheet(
    L.in('reset', Defaults.reset),
    L.in('defaults', Defaults.all),
    Theme.root(theme),
  ) + sheets.join('')
const page = `<!doctype html><html><head><meta charset="utf-8"><title>Specimen</title><style>${css}
.spec{max-inline-size:72rem;margin:0 auto;padding:2rem;display:grid;gap:2.5rem}
.spec section{display:grid;gap:0.9rem}
.spec-title{font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--fk-text-muted)}
.spec-row{display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center}
.spec-stack{display:grid;gap:0.35rem;min-inline-size:16rem}
.spec-inline{display:inline-flex;gap:0.4rem;align-items:center}
.spec-label{font-size:0.75rem;color:var(--fk-text-muted);min-inline-size:3.5rem}
.spec-swatch{inline-size:2.5rem;block-size:2rem;border-radius:6px;border:1px solid var(--fk-outline-subtle)}
</style></head><body><main class="spec">${[palette, plain, buttons, fields, toggles, tabs, badges, dialogs].join('')}</main></body></html>`
writeFileSync(out, page)
console.log(`wrote ${out} (${page.length} bytes)`)
