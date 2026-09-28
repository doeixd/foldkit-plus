/**
 * `Inert.draw` through `h.submodel`, and the checks a view test repeats:
 * `Inert.css` and `Inert.missingTokens`.
 */
import { Option } from 'effect'
import { childAttributes, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineView } from 'foldkit/submodel'
import { describe, expect, it } from 'vitest'
import { Style } from '../src/index.js'
import { Inert } from '../src/testing.js'
import * as SlotView from '../src/slotView.js'

type ChildMessage = { readonly _tag: 'Toggled' }
type ParentMessage = { readonly _tag: 'GotChild'; readonly message: ChildMessage }

/** A Submodel as `@foldkit/ui` writes one: its own attributes handed to the parent's `toView`. */
const Toggle = defineView<
  { readonly on: boolean },
  ChildMessage,
  { readonly toView: (attributes: ReturnType<typeof childAttributes>) => Html }
>((model, viewInputs, h) =>
  h.div(
    [],
    [
      h.span([], [model.on ? 'on' : 'off']),
      viewInputs.toView(
        childAttributes([h.OnClick({ _tag: 'Toggled' }), h.AriaPressed(String(model.on))]),
      ),
    ],
  ),
)

const Page = Style.slots({
  root: { color: 'var(--fk-text-default)', padding: 'var(--fk-space-md, 1rem)' },
  button: { '--fk-local': '1px', margin: 'var(--fk-local)', gap: 'var(--fk-knob-gap)' },
})

const PageView = SlotView.forMessages<ParentMessage>()
  .define(Page.slots, (on: boolean, slots, h: HtmlBuilder<ParentMessage>) =>
    h.main(slots.root.attrs(), [
      h.submodel({
        slotId: 'toggle',
        model: { on },
        view: Toggle,
        viewInputs: { toView: attributes => h.button(slots.button.attrs(attributes), ['Toggle']) },
        toParentMessage: message => ({ _tag: 'GotChild', message }),
      }),
    ]),
  )
  .pipe(Style.attach(Page.style))

describe('Inert.draw', () => {
  it('draws a view that embeds a Submodel, marking the Slots inside it', () => {
    const tree = Inert.draw(PageView, true)
    expect(Inert.bySlot(tree, 'button').map(Inert.text)).toEqual(['Toggle'])
    expect(Inert.pressed(Inert.byTag(tree, 'button')[0])).toEqual(Option.some(true))
    expect(Inert.unslotted(tree)).toEqual(['main > div', 'main > div > span'])
  })

  it('returns what the view drew, including nothing', () => {
    const Nothing = SlotView.forMessages<never>().define(Page.slots, (_: void) => null)
    expect(Inert.draw(Nothing, undefined)).toBeNull()
  })

  it('still throws what the view throws', () => {
    const Broken = SlotView.forMessages<never>().define(Page.slots, (_: void): Html => {
      throw new Error('broken view')
    })
    expect(() => Inert.draw(Broken, undefined)).toThrow('broken view')
  })
})

describe('Inert.css and Inert.missingTokens', () => {
  const tree = Inert.draw(PageView, false)

  it('gives the compiled CSS behind the nodes', () => {
    const [button] = Inert.bySlot(tree, 'button')
    expect(Inert.css(button === undefined ? [] : [button])).toContain('margin:var(--fk-local)')
    expect(Inert.css([])).not.toContain('style-')
  })

  it('lists a token read with no fallback that nothing defines, and only that', () => {
    // `--fk-space-md` has a fallback; `--fk-local` is defined by the drawn rule.
    expect(Inert.missingTokens(tree, '')).toEqual(['--fk-text-default', '--fk-knob-gap'])
    expect(Inert.missingTokens(tree, ':root{--fk-text-default:red;--fk-knob-gap:1px}')).toEqual([])
  })

  it('counts a token set inline on a drawn element as defined', () => {
    const Inline = SlotView.forMessages<never>()
      .define(Page.slots, (_: void, slots, h) =>
        h.main(slots.root.attrs([h.Style({ '--fk-text-default': 'red' })]), []),
      )
      .pipe(Style.attach(Page.style))
    expect(Inert.missingTokens(Inert.draw(Inline, undefined), '')).toEqual([])
  })

  it('lists a token an inline style value reads that nothing defines', () => {
    const InlineRead = SlotView.forMessages<never>()
      .define(Page.slots, (_: void, slots, h) =>
        h.main(slots.root.attrs([h.Style({ color: 'var(--fk-inline-read)' })]), []),
      )
      .pipe(Style.attach(Page.style))
    const tree = Inert.draw(InlineRead, undefined)
    // Without the inline scan this passes for the wrong reason: no drawn
    // rule reads the token, so nothing reports it.
    expect(Inert.missingTokens(tree, '')).toEqual(expect.arrayContaining(['--fk-inline-read']))
    expect(Inert.missingTokens(tree, ':root{--fk-inline-read:red}')).toEqual(
      expect.not.arrayContaining(['--fk-inline-read']),
    )
  })
})
