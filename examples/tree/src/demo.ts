import { Selection, TreeNavigation } from 'foldkit-primitives/interaction'
import { Nav, Sel, allRows, initial, labelOf, navArgs, update, type Model } from './app.js'

const renderText = (model: Model): ReadonlyArray<string> => {
  const showing = TreeNavigation.shown(allRows(), model.nav, navArgs)
  return showing.map(row => {
    const selected = model.selection.selected.includes(row.id) ? '*' : ' '
    const glyph = row.branch ? (TreeNavigation.isOpen(model.nav, navArgs, row.id) ? '▾' : '▸') : '•'
    return `${selected} ${'  '.repeat(row.level - 1)}${glyph} ${labelOf(row.id)}`
  })
}

export const runDemo = (): ReadonlyArray<string> => {
  const lines: Array<string> = []
  let model = initial.model
  const show = (title: string): void => {
    lines.push(title)
    lines.push(...renderText(model))
  }
  show('closed:')
  model = update(model, Nav.wrapper.make(TreeNavigation.Message.Opened({ id: 'src' }))).model
  show('src open:')
  model = update(model, Nav.wrapper.make(TreeNavigation.Message.Opened({ id: 'components' }))).model
  model = update(model, Sel.wrapper.make(Selection.Message.Activated({ id: 'button' }))).model
  show('button selected:')
  return lines
}
