import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Breakpoints, MediaQuery, PrefersDark } from '../../src/media/index.js'

const Page = Bundle.compose({ theme: Schema.String }).pipe(
  Bundle.withChild('dark', MediaQuery, { args: { query: '(prefers-color-scheme: dark)' } }),
)
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({ theme: 'light' }),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.div([], [model.dark.matches ? 'Dark mode' : 'Light mode']),
  subscriptions: placements.subscriptions(),
})
void config

const Themed = Bundle.compose({ theme: Schema.String }).pipe(Bundle.withChild('dark', PrefersDark))
void Themed.placements

const Layout = Bundle.compose({}).pipe(
  Bundle.withChild('bp', Breakpoints, { args: { breakpoints: { sm: 640, md: 768, lg: 1024 } } }),
)
void Layout.placements
