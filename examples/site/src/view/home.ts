/**
 * The home page: what Foldkit Plus is, the one rule every package keeps, one
 * application extended four ways, and a card for each package family. The
 * code is real: each example is a file under `src/snippets` that the
 * typecheck compiles, coloured at build time into a static region.
 */
import type { Html } from 'foldkit/html'
import { SSR } from 'foldkit-ssr/client'

import { shelves, subsites, type Subsite } from '../catalog.js'
import { demos, onGitHub, packageName } from '../demos.js'
import type { Library } from '../library.js'
import { Message, type Example, type Model } from '../main.js'
import type { H, Slots } from './layout.js'

const INSTALL = 'pnpm add effect foldkit foldkit-surface'

/** The page's sections, as the rail lists them. */
const sections = [
  { id: 'idea', title: 'One state machine' },
  { id: 'boundary', title: 'Draw a boundary' },
  { id: 'connect', title: 'Then connect it' },
  { id: 'server', title: 'Server data' },
  { id: 'packages', title: 'Packages' },
  { id: 'demos', title: 'Demos' },
  { id: 'status', title: 'Status' },
] as const

type SectionId = (typeof sections)[number]['id']

export const homeContents = (slots: Slots, h: H): ReadonlyArray<Html> => [
  h.ol(
    slots.contents.attrs([h.AriaLabel('On this page')]),
    sections.map(section => h.li([], [h.a([h.Href(`#${section.id}`)], [section.title])])),
  ),
]

const section = (
  slots: Slots,
  h: H,
  { id, title }: { readonly id: SectionId; readonly title: string },
  children: ReadonlyArray<Html>,
): Html =>
  h.section(slots.section.attrs([h.Id(id), h.AriaLabelledBy(`${id}-title`)]), [
    h.h2(slots.sectionTitle.attrs([h.Id(`${id}-title`)]), [title]),
    ...children,
  ])

const code = (h: H, ...parts: ReadonlyArray<string>) => h.code([], [parts.join('')])

const hero = (model: Model, slots: Slots, h: H): Html =>
  h.section(slots.hero.attrs(), [
    h.h1(slots.heroTitle.attrs(), [
      'Your Foldkit app, extended to every boundary. ',
      h.span(slots.quiet.attrs(), ['Without a second place to keep state.']),
    ]),
    h.p(slots.lede.attrs(), [
      'Agents, servers, other devices, the URL and design systems each get a package. Every one of them reads the Model and sends the Messages ',
      code(h, 'update'),
      ' already handles, so the application stays one state machine.',
    ]),
    h.div(slots.actions.attrs(), [
      h.a(slots.primary.attrs([h.Href('/learn')]), ['Get started']),
      h.button(
        slots.install.attrs([
          h.Type('button'),
          h.OnClick(Message.PressedCopy({ text: INSTALL })),
          h.AriaLabel(`Copy “${INSTALL}”`),
        ]),
        [INSTALL, h.span(slots.installHint.attrs(), [model.copied ? 'Copied' : 'Copy'])],
      ),
    ]),
    h.p(slots.note.attrs(), [
      'Built on ',
      h.a([h.Href('https://foldkit.dev')], ['Foldkit']),
      ' and ',
      h.a([h.Href('https://effect.website')], ['Effect']),
      '. See it running in ',
      h.a([h.Href('/demos')], ['the demos']),
      '.',
    ]),
  ])

/** The rules every package keeps, from the skill's list. */
const rules: ReadonlyArray<{ readonly title: string; readonly text: ReadonlyArray<string> }> = [
  { title: 'Agents', text: ['An agent can only send Messages ', '`update`', ' already handles.'] },
  {
    title: 'Servers',
    text: ['Server data lives in the Model and is reduced by ', '`update`', '.'],
  },
  {
    title: 'Devices',
    text: ['Replicas replay the same Messages through the same ', '`update`', '.'],
  },
  {
    title: 'The URL',
    text: ['The URL and storage mirror a slice of the Model; they never own it.'],
  },
  {
    title: 'Design systems',
    text: ['Views are styled and extended from outside, without forking them.'],
  },
]

/** Text with `code` spans written between backticks, as the rules above are. */
const withCode = (h: H, parts: ReadonlyArray<string>) =>
  parts.map(part => (part.startsWith('`') ? h.code([], [part.slice(1, -1)]) : part))

const idea = (slots: Slots, h: H): Html =>
  section(slots, h, { id: 'idea', title: 'One state machine.' }, [
    h.p(slots.sectionText.attrs(), [
      'A Foldkit application is a Schema-typed ',
      h.strong([], ['Model']),
      ', a ',
      h.strong([], ['Message']),
      ' union naming everything that can happen, and one pure ',
      code(h, 'update'),
      ' that turns a Message into the next Model. That shape is easy to test and replay, and it is lost the moment an application grows a cache in a hook, a store in the URL, or a tool handler that does a transition again. Each package here keeps it:',
    ]),
    h.ul(
      slots.grid.attrs(),
      rules.map((rule, index) =>
        h.li(slots.cell.attrs(), [
          h.p(slots.cellLabel.attrs(), [String(index + 1).padStart(2, '0')]),
          h.h3(slots.cellTitle.attrs(), [rule.title]),
          h.p(slots.cellText.attrs(), withCode(h, rule.text)),
        ]),
      ),
    ),
  ])

const frame = (slots: Slots, h: H, about: ReadonlyArray<Html>, draw: Html): Html =>
  h.div(slots.frame.attrs(), [
    h.div(slots.panel.attrs(), [
      h.div(slots.panelAbout.attrs(), about),
      h.div(slots.code.attrs(), [draw]),
    ]),
  ])

const boundary = (library: Library, slots: Slots, h: H): Html =>
  section(slots, h, { id: 'boundary', title: 'Draw a boundary.' }, [
    h.p(slots.sectionText.attrs(), [
      'Start from the application you have. ',
      code(h, 'Surface.application'),
      ' adds nothing to it; ',
      code(h, 'App.surface'),
      ' names a boundary: what one feature may read, and the Messages it may send. Every other package consumes boundaries like this one.',
    ]),
    frame(
      slots,
      h,
      [
        h.p(slots.cellLabel.attrs(), ['app.ts']),
        h.h3(slots.cellTitle.attrs(), ['A todo list']),
        h.p(slots.cellText.attrs(), [
          'Todos, a filter and a selection; four Messages; one ',
          code(h, 'update'),
          '. The ',
          code(h, 'TodoList'),
          ' Surface sees the todos and the filter, and may toggle and filter.',
        ]),
      ],
      SSR.static('example-app', library.example('app')),
    ),
  ])

const examples: ReadonlyArray<{
  readonly example: Example
  readonly tab: string
  readonly file: string
  readonly title: string
  readonly text: ReadonlyArray<string>
  readonly subsite: string
}> = [
  {
    example: 'view',
    tab: 'View',
    file: 'view.ts',
    title: 'Draw it through slots',
    text: [
      'A view of the Surface reads only what it projects. Its slots are where a design system attaches, from outside, with ',
      '`Style.attach`',
      '.',
    ],
    subsite: 'mixins',
  },
  {
    example: 'agent',
    tab: 'Agent',
    file: 'agent.ts',
    title: 'Hand it to an agent',
    text: [
      'An agent sees the todos and may add or toggle one, as tools over MCP, WebMCP, A2A or Agent Native. Each call is a Message through ',
      '`update`',
      '.',
    ],
    subsite: 'agent',
  },
  {
    example: 'sync',
    tab: 'Sync',
    file: 'sync.ts',
    title: 'Take it offline',
    text: [
      'The todos replicate across tabs and devices. Adding and toggling are durable operations, kept while offline and replayed through the same ',
      '`update`',
      ' everywhere.',
    ],
    subsite: 'sync',
  },
  {
    example: 'mirror',
    tab: 'Mirror',
    file: 'mirror.ts',
    title: 'Put it in the URL',
    text: [
      'The filter is mirrored into the address, so a link restores it. The Model still owns it.',
    ],
    subsite: 'mirror',
  },
]

const connect = (model: Model, library: Library, slots: Slots, h: H): Html =>
  section(slots, h, { id: 'connect', title: 'Then connect it.' }, [
    h.p(slots.sectionText.attrs(), [
      'The same ',
      code(h, 'App'),
      ', extended four ways. None of them adds a reducer, a store or a cache the Model does not already hold.',
    ]),
    h.div(slots.frame.attrs(), [
      h.div(
        slots.tabs.attrs([h.Role('tablist'), h.AriaLabel('Ways to extend the application')]),
        examples.map(({ example, tab }) =>
          h.button(
            slots.tab.attrs([
              h.Type('button'),
              h.Role('tab'),
              h.Id(`tab-${example}`),
              h.AriaSelected(model.example === example),
              h.AriaControls(`panel-${example}`),
              h.OnClick(Message.ChoseExample({ example })),
            ]),
            [tab],
          ),
        ),
      ),
      ...examples.map(({ example, file, title, text, subsite }) =>
        h.div(
          slots.panel.attrs([
            h.Id(`panel-${example}`),
            h.Role('tabpanel'),
            h.AriaLabelledBy(`tab-${example}`),
            ...(model.example === example ? [] : [h.Hidden(true)]),
          ]),
          [
            h.div(slots.panelAbout.attrs(), [
              h.p(slots.cellLabel.attrs(), [file]),
              h.h3(slots.cellTitle.attrs(), [title]),
              h.p(slots.cellText.attrs(), withCode(h, text)),
              h.p(slots.cellText.attrs(), [h.a([h.Href(`/${subsite}`)], ['Read the guide →'])]),
            ]),
            h.div(slots.code.attrs(), [SSR.static(`example-${example}`, library.example(example))]),
          ],
        ),
      ),
    ]),
  ])

const server = (library: Library, slots: Slots, h: H): Html =>
  section(slots, h, { id: 'server', title: 'Server data, in the Model.' }, [
    h.p(slots.sectionText.attrs(), [
      'Facts a server owns are cached inside the Model, normalized by entity, and reduced by ',
      code(h, 'update'),
      '. A Surface says what it shows; Remote works out what to fetch, keeps it live, and tells the view what the Model knows right now.',
    ]),
    frame(
      slots,
      h,
      [
        h.p(slots.cellLabel.attrs(), ['remote.ts']),
        h.h3(slots.cellTitle.attrs(), ['Read a project']),
        h.p(slots.cellText.attrs(), [
          'The domain is declared once with ',
          code(h, 'foldkit-entity'),
          '. The same declaration binds to Drizzle tables on the server, and guards say who may read it.',
        ]),
        h.p(slots.cellText.attrs(), [h.a([h.Href('/remote')], ['Read the guide →'])]),
      ],
      SSR.static('example-remote', library.example('remote')),
    ),
  ])

const card = (subsite: Subsite, slots: Slots, h: H): Html =>
  h.li(
    [],
    [
      h.a(slots.card.attrs([h.Href(`/${subsite.id}`)]), [
        h.h3(slots.cardTitle.attrs(), [
          subsite.title,
          h.span(slots.cardArrow.attrs([h.AriaHidden(true)]), ['→']),
        ]),
        h.p(slots.cardText.attrs(), [subsite.tagline]),
        h.p(slots.cardMeta.attrs(), [`Owner: ${subsite.owner}`]),
        h.p(slots.cardMeta.attrs(), [subsite.packages.map(packageName).join(' · ')]),
      ]),
    ],
  )

const packages = (slots: Slots, h: H): Html =>
  section(slots, h, { id: 'packages', title: 'Packages.' }, [
    h.p(slots.sectionText.attrs(), [
      'Pick a package by who owns the data. Each family has its guides, cut from its READMEs, and an API reference read from its source.',
    ]),
    ...shelves.map(({ shelf, about }) =>
      h.div(slots.shelf.attrs(), [
        h.div(slots.shelfHead.attrs(), [
          h.h3(slots.shelfTitle.attrs(), [shelf]),
          h.p(slots.shelfAbout.attrs(), [about]),
        ]),
        h.ul(
          slots.cards.attrs(),
          subsites
            .filter(subsite => subsite.shelf === shelf)
            .map(subsite => card(subsite, slots, h)),
        ),
      ]),
    ),
  ])

export const demoRows = (slots: Slots, h: H): Html =>
  h.ul(
    slots.rows.attrs(),
    demos.map(demo =>
      h.li(slots.row.attrs(), [
        h.div(slots.rowAbout.attrs(), [
          h.h3(slots.rowTitle.attrs(), [
            h.a(slots.titleLink.attrs([h.Href(demo.url)]), [demo.title]),
          ]),
          h.p(slots.rowText.attrs(), [demo.proves]),
          h.p(slots.packages.attrs([h.AriaLabel('Packages')]), [
            ...demo.packages.flatMap((name, index) => [
              ...(index === 0 ? [] : [' · ']),
              h.a(slots.package.attrs([h.Href(onGitHub(`packages/${name}/README.md`))]), [
                packageName(name),
              ]),
            ]),
          ]),
        ]),
        h.p(slots.rowActions.attrs(), [
          h.a(slots.open.attrs([h.Href(demo.url)]), ['Open']),
          h.a(slots.source.attrs([h.Href(onGitHub(demo.readFirst))]), ['Source']),
        ]),
      ]),
    ),
  )

const demosSection = (slots: Slots, h: H): Html =>
  section(slots, h, { id: 'demos', title: 'Demos.' }, [
    h.p(slots.sectionText.attrs(), [
      'Examples from the repository, built as static files. Those with a server run it in your browser, shared by every tab, so nothing you do leaves it.',
    ]),
    demoRows(slots, h),
  ])

const status = (slots: Slots, h: H): Html =>
  section(slots, h, { id: 'status', title: 'Status.' }, [
    h.p(slots.sectionText.attrs(), [
      'Every package is ',
      code(h, '0.x'),
      ' and may break between minor versions; the ',
      h.a([h.Href(onGitHub('CHANGELOG.md'))], ['changelog']),
      ' says how to upgrade. They target Foldkit ',
      code(h, '0.165'),
      ' and Effect ',
      code(h, '4.0.0'),
      '. Some are marked early or experimental on their pages; ',
      h.a([h.Href(onGitHub('docs/releases.md'))], ['the release matrix']),
      ' lists each version.',
    ]),
  ])

export const homePage = (
  model: Model,
  library: Library,
  slots: Slots,
  h: H,
): ReadonlyArray<Html> => [
  hero(model, slots, h),
  idea(slots, h),
  boundary(library, slots, h),
  connect(model, library, slots, h),
  server(library, slots, h),
  packages(slots, h),
  demosSection(slots, h),
  status(slots, h),
]
