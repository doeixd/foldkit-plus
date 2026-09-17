// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { installDom } from '../src/dom.js'

it('traces a React island, an embedded Foldkit program, and compiled TSX', async () => {
  installDom()
  const { runDemo } = await import('../src/demo.js')
  const lines = await runDemo()
  expect(lines).toContain('island host: <foldkit-react-host>')
  expect(lines).toContain('rendered: Dune ★★★☆☆')
  expect(lines).toContain('suspense: loading details…')
  expect(lines).toContain(
    'React onRate(5) -> Message Rated -> Model: Dune, 5 stars; island shows ★★★★★',
  )
  expect(lines).toContain('Foldkit renamed the title; React state kept: previews: 2')
  expect(lines).toContain('suspense resolved: details for 5 stars')
  expect(lines).toContain('rendered with step prop 2: count 10 (+2)')
  expect(lines).toContain('outbound Port -> onCount: first:12')
  expect(lines).toContain(
    'new props (step 5, new callback): count 17 (+5); reports first:12, second:17',
  )
  expect(lines).toContain('unmounted: runtime disposed = true, counter in DOM = false')
  expect(lines).toContain(
    "export const card = (model: Model, dispatch: (message: Message) => void): ReactNode => (<article className={'card'}><h2>{model.title}</h2><button onClick={() => dispatch(Message.Rated({ stars: 5 }))} aria-label={'Rate five'}>★★★★★</button></article>);",
  )
  expect(lines).toContain(
    "src/chart.ts:3:13 - error FKREACT0002: h.OnMount cannot be compiled to standalone React JSX. Use foldkit-react's runtime interop, or write this element in React.",
  )
}, 30_000)
