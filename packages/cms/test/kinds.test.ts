import { Schema } from 'effect'
import { Crud, Display } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { SlotView } from 'foldkit-mixins'
import { ListView } from 'foldkit-mixins-crud'
import { FormView } from 'foldkit-mixins-form'
import { describe, expect, it } from 'vitest'
import { Cms, type State } from '../src/index.js'

interface Node {
  readonly sel?: string
  readonly text?: string
  readonly data?: {
    readonly props?: Readonly<Record<string, unknown>>
    readonly attrs?: Readonly<Record<string, unknown>>
  }
  readonly children?: ReadonlyArray<Node>
}
const all = (node: Node): ReadonlyArray<Node> => [node, ...(node.children ?? []).flatMap(all)]
const text = (node: Node | undefined): string =>
  node === undefined
    ? ''
    : all(node)
        .map(child => child.text ?? '')
        .join('')

describe('Cms.slugify', () => {
  it.each([
    ['Hello, World!', 'hello-world'],
    ['  Crème brûlée  ', 'creme-brulee'],
    ['a--b__c', 'a-b-c'],
    ['!!!', ''],
  ])('%s', (from, to) => expect(Cms.slugify(from)).toBe(to))
})

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    slug: Schema.String,
    goesLiveAt: Schema.NullOr(Schema.String),
  }),
)
const PostForm = Form.make(
  'PostForm',
  Entity.input(
    Post,
    Schema.Struct({
      title: Schema.String,
      slug: Schema.String,
      goesLiveAt: Schema.NullOr(Schema.String),
    }),
  ),
  { inputs: { slug: Cms.slug('title', { prefix: '/blog/' }), goesLiveAt: Cms.dateTime() } },
)
const send = (...messages: ReadonlyArray<typeof PostForm.Message.Type>) =>
  messages.reduce(
    (model, message) => PostForm.bundle.update(model, message, undefined).model,
    PostForm.initial,
  )
const change = (key: 'title' | 'slug' | 'goesLiveAt', value: string) =>
  PostForm.Message.Changed({ key, value })

describe('Cms.slug', () => {
  it('follows the title as an address until the author writes it, then is theirs', () => {
    const typed = send(change('title', 'Hello, World!'))
    expect(PostForm.field(typed, 'slug').value).toBe('hello-world')
    expect(PostForm.isFollowing(typed, 'slug')).toBe(true)

    const own = send(change('title', 'Hello'), change('slug', 'mine'), change('title', 'Goodbye'))
    expect(PostForm.field(own, 'slug').value).toBe('mine')
  })

  it('does not move a published address because its title did', () => {
    const filled = PostForm.fill(PostForm.initial, { title: 'Hello', slug: 'hello' }).model
    const retitled = PostForm.bundle.update(filled, change('title', 'Goodbye'), undefined).model
    expect(PostForm.field(retitled, 'slug').value).toBe('hello')
  })

  it('is its own kind, carrying the address it completes', () => {
    const control = PostForm.controls.find(found => found.key === 'slug')!.control
    expect(Cms.Input.Slug.is(control) && control.data.prefix).toBe('/blog/')
  })

  it('refuses a key that holds no text', () => {
    expect(() =>
      Form.make(
        'Bad',
        Entity.input(
          Entity.define('Flag', Schema.Struct({ id: Schema.String, on: Schema.Boolean })),
          Schema.Struct({ on: Schema.Boolean }),
        ),
        { inputs: { on: Cms.slug('on') } },
      ),
    ).toThrow('holds no text')
  })
})

describe('Cms.dateTime', () => {
  it('submits what a datetime-local input wrote as a moment', () => {
    const model = send(change('title', 'T'), change('goesLiveAt', '2026-03-02T10:00'))
    expect(PostForm.engine.value(model)?.goesLiveAt).toBe(
      new Date('2026-03-02T10:00').toISOString(),
    )
  })

  it('says text that is no moment is none, and submits nothing for an empty one', () => {
    const bad = send(change('goesLiveAt', 'next tuesday'))
    expect(PostForm.field(bad, 'goesLiveAt')).toMatchObject({
      _tag: 'Invalid',
      errors: ['Enter a date and a time'],
    })
    expect(PostForm.engine.value(send(change('title', 'T')))?.goesLiveAt).toBeNull()
  })
})

const state = (tag: State['_tag'], schedule: State['schedule'] = null): State => ({
  _tag: tag,
  schedule,
})
const at = '2026-03-02T10:00:00.000Z'

describe('Cms.Display.State', () => {
  const display = Cms.Display.State.of({})
  it('says the state, and what its schedule adds', () => {
    expect(Display.show(display, state('Published'))).toBe('Published')
    expect(Display.show(display, state('Changed', { at, overdue: false, error: null }))).toBe(
      'Changed, scheduled',
    )
    // A publish that did not happen is not dressed up as one that will.
    expect(Display.show(display, state('New', { at, overdue: true, error: 'slug taken' }))).toBe(
      'New, overdue',
    )
  })

  it('takes the application’s words', () => {
    const worded = Cms.Display.State.of({
      words: { Changed: 'Unpublished changes', overdue: 'late' },
    })
    expect(Display.show(worded, state('Changed', { at, overdue: true, error: null }))).toBe(
      'Unpublished changes, late',
    )
  })
})

describe('Cms.Display.Moment', () => {
  it('is the date and the time, with no clock', () => {
    expect(Display.show(Cms.Display.Moment.of({}), at)).toBe('Mar 2, 2026, 10:00 AM')
  })

  it.each([
    ['2026-03-05T10:00:00.000Z', '3 days ago'],
    ['2026-03-02T13:00:00.000Z', '3 hours ago'],
    ['2026-03-02T10:00:20.000Z', 'this minute'],
    ['2026-03-01T10:00:00.000Z', 'tomorrow'],
    ['2027-04-02T10:00:00.000Z', 'last year'],
  ])('reads relative to a clock at %s', (now, said) => {
    expect(Display.show(Cms.Display.Moment.of({ now: () => new Date(now) }), at)).toBe(said)
  })

  it('says what is no time as it is', () => {
    expect(Display.show(Cms.Display.Moment.of({}), 'soon')).toBe('soon')
  })
})

describe('the renderers, beside the mixins’ own', () => {
  it('draw a slug after its address, and a moment as a datetime-local input', () => {
    const View = FormView.define(PostForm, { renderers: Cms.controlRenderers() })
    const model = send(change('title', 'Hello'), change('goesLiveAt', at))
    const root = View(
      { model, errors: model.errors, canSubmit: true },
      SlotView.inertBuilder(),
    ) as unknown as Node
    const byId = (id: string) => all(root).find(node => node.data?.props?.id === id)

    expect(byId('PostForm-slug')?.data?.props?.value).toBe('hello')
    expect(all(root).some(node => text(node) === '/blog/')).toBe(true)
    const moment = byId('PostForm-goesLiveAt')
    expect(moment?.data?.props?.type).toBe('datetime-local')
    // An ISO moment is shown as the input writes one, in the viewer's zone.
    expect(String(moment?.data?.props?.value)).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/)
    expect(new Date(String(moment?.data?.props?.value)).toISOString()).toBe(at)
    // The shipped renderers still draw the rest.
    expect(byId('PostForm-title')?.sel).toBe('input')
  })

  it('draw an entry’s state as a badge and its times as times, with nothing said in the list', () => {
    const Rows = Entity.select(Cms.Entities.Entry, { label: true, state: true, createdAt: true })
    const List = Crud.list('Entries', { query: Cms.Entries, selection: Rows })
    expect(List.columns.map(column => column.display.kind)).toEqual([
      'Text',
      'CmsState',
      'CmsMoment',
    ])

    const Table = ListView.forMessages<never>().define(List)
    const row = {
      id: Cms.newEntryId(),
      label: 'Hello',
      state: state('Changed', { at, overdue: true, error: null }),
      createdAt: at,
    }
    const root = Table(
      {
        page: {
          _tag: 'Ready',
          value: { items: [row], hasNext: false, hasPrevious: false },
        } as never,
        renderers: Cms.displayRenderers(),
      },
      SlotView.inertBuilder(),
    ) as unknown as Node

    const badge = all(root).find(node => node.data?.attrs?.['data-cms-state'] !== undefined)
    expect(badge?.data?.attrs).toEqual({
      'data-cms-state': 'Changed',
      'data-cms-schedule': 'overdue',
    })
    expect(text(badge)).toBe('Changed, overdue')
    const time = all(root).find(node => node.sel === 'time')
    expect(time?.data?.attrs?.['datetime']).toBe(at)
    expect(text(time)).toBe('Mar 2, 2026, 10:00 AM')
  })
})
