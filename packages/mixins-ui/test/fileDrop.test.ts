// @vitest-environment jsdom
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Scene } from 'foldkit/test'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as FileDrop from '@foldkit/ui/fileDrop'
import { Behavior, Diagnostics, Event, Style, type MixinValue } from 'foldkit-mixins'
import { FileDrop as FileDropAdapter, FileDropSlots, type ResolvedFileDrop } from '../src/index.js'
import { classValue, holds } from './fixture.js'

type Message = FileDrop.Message

interface Captured {
  readonly render: FileDrop.FileDropAttributes
  readonly resolved: ResolvedFileDrop<Message>
}

const runDrop = (
  model: FileDrop.Model,
  mixins: ReadonlyArray<MixinValue<Message> | MixinValue<never>>,
  capture: (captured: Captured) => void,
  draw: (resolved: ResolvedFileDrop<Message>, h: HtmlBuilder<Message>) => Html,
  inputs: Partial<Pick<FileDrop.ViewInputs, 'accept' | 'multiple' | 'isDisabled'>> = {},
  ...extra: Array<Parameters<typeof Scene.scene<FileDrop.Model, Message, FileDrop.OutMessage>>[1]>
): void => {
  Scene.scene<FileDrop.Model, Message, FileDrop.OutMessage>(
    {
      update: FileDrop.update,
      view: (current, h) =>
        FileDrop.view(
          current,
          {
            ...inputs,
            toView: render => {
              const resolved = FileDropAdapter.resolve(render, mixins, {
                input: undefined,
                h,
              })
              capture({ render, resolved })
              return draw(resolved, h)
            },
          },
          h,
        ),
    },
    Scene.given(model),
    ...extra,
  )
}

const drawDefault = (resolved: ResolvedFileDrop<Message>, h: HtmlBuilder<Message>): Html =>
  h.label([...resolved.root], [h.input([...resolved.input]), 'Drop files here'])

const model = FileDrop.init({ id: 'test-drop' })

/** The class a child attribute carries, if it carries one. */
const classOfChild = (child: unknown): string | undefined => {
  const inner = (
    child as { readonly attribute?: { readonly _tag?: string; readonly value?: unknown } }
  ).attribute
  return inner?._tag === 'Class' && typeof inner.value === 'string' ? inner.value : undefined
}

describe('FileDrop adapter', () => {
  it('preserves the base bundles by identity, a class joining the slot’s own', () => {
    let captured: Captured | undefined
    runDrop(
      model,
      [],
      value => {
        captured = value
      },
      drawDefault,
    )
    const { render, resolved } = captured!
    for (const child of render.root) expect(holds(resolved.root, child)).toBe(true)
    // The input's `sr-only` arrives as a child attribute; it joins the slot's
    // class, since two class lists on one element would draw only one.
    for (const child of render.input)
      if (classOfChild(child) === undefined) expect(holds(resolved.input, child)).toBe(true)
    expect(classValue(resolved.input)).toBe('sr-only')
  })

  it('styles the zone and its input', () => {
    const DropStyle = Style.forSlots(FileDropSlots)({
      root: Style.class('drop-zone'),
      input: Style.class('drop-input'),
    })
    let captured: Captured | undefined
    runDrop(
      model,
      [DropStyle.mixin],
      value => {
        captured = value
      },
      drawDefault,
    )
    const { resolved } = captured!
    expect(classValue(resolved.root)).toBe('drop-zone')
    // The component's own class stays beside the style's.
    expect(classValue(resolved.input)).toBe('sr-only drop-input')
  })

  it('marks drag-over and disabled state from the model and inputs', () => {
    let captured: Captured | undefined
    runDrop(
      { ...model, isDragOver: true },
      [],
      value => {
        captured = value
      },
      drawDefault,
      { isDisabled: true },
    )
    expect(captured).toBeDefined()
    Scene.scene<FileDrop.Model, Message, FileDrop.OutMessage>(
      {
        update: FileDrop.update,
        view: (current, h) =>
          FileDrop.view(
            current,
            {
              isDisabled: true,
              toView: FileDropAdapter.toView([], { h }, resolved => drawDefault(resolved, h)),
            },
            h,
          ),
      },
      Scene.given({ ...model, isDragOver: true }),
      Scene.expect(Scene.selector('label')).toHaveAttr('data-drag-over', ''),
      Scene.expect(Scene.selector('label')).toHaveAttr('data-disabled', ''),
      Scene.expect(Scene.selector('input')).toHaveAttr('disabled', 'true'),
    )
  })

  it('refuses a Behavior that takes over the input change', () => {
    const Steal = Behavior.forSlots(FileDropSlots)<undefined, Message>({
      input: Behavior.slot({
        requires: { events: [Event.Change] },
        attributes: ({ h }: { readonly h: HtmlBuilder<Message> }) => [
          h.OnFileChange(() => FileDrop.Message.DroppedNonFiles()),
        ],
      }),
    })
    expect(() => runDrop(model, [Steal.mixin], () => {}, drawDefault)).toThrow(
      Diagnostics.DiagnosticError,
    )
  })

  it('refuses a Behavior that adds a second dragenter owner', () => {
    const Steal = Behavior.forSlots(FileDropSlots)<undefined, Message>({
      root: Behavior.slot({
        attributes: ({ h }: { readonly h: HtmlBuilder<Message> }) => [
          h.OnDragEnter(FileDrop.Message.EnteredDragZone()),
        ],
      }),
    })
    expect(() => runDrop(model, [Steal.mixin], () => {}, drawDefault)).toThrow(
      Diagnostics.DiagnosticError,
    )
  })

  describe('Message', () => {
    const decode = Schema.decodeUnknownSync(FileDropAdapter.Message)
    const file = new File(['x'], 'a.txt')

    it('decodes a drop of files to the Message upstream updates on', () => {
      const message = decode({ _tag: 'DroppedFiles', files: [file] })
      const next = FileDrop.update(model, message)
      expect(next.outMessage).toEqual({ _tag: 'ReceivedFiles', files: [file] })
    })

    it.each([
      ['an empty drop', { _tag: 'DroppedFiles', files: [] }],
      ['a value that is no File', { _tag: 'DroppedFiles', files: [{ name: 'a.txt' }] }],
      ['a tag the zone lacks', { _tag: 'DroppedFolders' }],
    ])('refuses %s', (_name, input) => {
      expect(() => decode(input)).toThrow()
    })
  })
})
