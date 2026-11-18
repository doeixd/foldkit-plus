// @vitest-environment jsdom
/**
 * The data and media widgets' state placed as `Bundles.X`, written as an
 * application writes it: each in a field the application names, its
 * Messages routed by the placement, what it reports answered in `onOut`.
 */
import * as UiFileDrop from '@foldkit/ui/fileDrop'
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Bundles, FileDrop, ImageCropper, Marquee, SignaturePad } from '../src/index.js'

const told = Schema.Array(Schema.String)

describe('Bundles.Marquee', () => {
  const App = Bundle.compose({}).pipe(
    Bundle.withChild('strip', Bundles.Marquee, {
      args: { id: 'logos', paused: true },
    }),
  )
  const start = () => App.placements.initial({}).model
  const fold = App.placements.update(model => ({ model }))

  it('starts from its args and folds its Messages', () => {
    expect(start().strip).toEqual(Marquee.init({ id: 'logos', paused: true }))
    const played = fold(
      start(),
      App.Message.GotStripMessage({ message: Marquee.Message.Resumed() }),
    )
    expect(played.model.strip.paused).toBe(false)
  })
})

describe('Bundles.ImageCropper', () => {
  const App = Bundle.compose({ told }).pipe(
    Bundle.withChild('crop', Bundles.ImageCropper, {
      args: { id: 'avatar', shape: 'round', aspect: 1, maxZoom: 5 },
      onOut: out => model => ({ model: { ...model, told: [...model.told, out._tag] } }),
    }),
  )
  const start = () => App.placements.initial({ told: [] }).model
  const fold = App.placements.update(model => ({ model }))
  const crop = (message: ImageCropper.Message) => App.Message.GotCropMessage({ message })

  it('starts from its args', () => {
    expect(start().crop).toEqual(
      ImageCropper.init({ id: 'avatar', shape: 'round', aspect: 1, maxZoom: 5 }),
    )
  })

  it('reports the answer to an export, and nothing else', () => {
    const exported = fold(
      start(),
      crop(ImageCropper.Message.Exported({ url: 'data:image/png;base64,AA', width: 8, height: 8 })),
    ).model
    const failed = fold(exported, crop(ImageCropper.Message.FailedExport({ reason: 'tainted' })))
    const turned = fold(failed.model, crop(ImageCropper.Message.Turned({ clockwise: true })))
    expect(turned.model.told).toEqual(['Exported', 'FailedExport'])
    expect(turned.model.crop.rotation).toBe(90)
  })

  it('refuses an aspect init refuses, at placement', () => {
    const Bad = Bundle.compose({}).pipe(
      Bundle.withChild('crop', Bundles.ImageCropper, {
        args: { id: 'bad', aspect: 0 },
        onOut: Bundle.ignore,
      }),
    )
    expect(() => Bad.placements.initial({})).toThrow(/aspect/)
  })
})

describe('Bundles.SignaturePad', () => {
  const App = Bundle.compose({ told }).pipe(
    Bundle.withChild('pad', Bundles.SignaturePad, {
      args: { id: 'sign', pen: { size: 6 } },
      onOut: out => model => ({ model: { ...model, told: [...model.told, out._tag] } }),
    }),
  )
  const start = () => App.placements.initial({ told: [] }).model
  const fold = App.placements.update(model => ({ model }))
  const pad = (message: SignaturePad.Message) => App.Message.GotPadMessage({ message })

  it('starts from its args, the pen over the defaults', () => {
    expect(start().pad.pen).toEqual({ size: 6, thinning: 0.6, smoothing: 0.5 })
  })

  it('reports the answer to a PNG, and nothing else', () => {
    const typed = fold(start(), pad(SignaturePad.Message.Typed({ text: 'Ada' }))).model
    const exported = fold(
      typed,
      pad(
        SignaturePad.Message.ExportedPng({ url: 'data:image/png;base64,AA', width: 2, height: 1 }),
      ),
    )
    const failed = fold(exported.model, pad(SignaturePad.Message.FailedExport({ reason: 'empty' })))
    expect(failed.model.told).toEqual(['ExportedPng', 'FailedExport'])
    expect(failed.model.pad.typed).toBe('Ada')
  })
})

describe('Bundles.FileDrop', () => {
  const App = Bundle.compose({ told }).pipe(
    Bundle.withChild('zone', Bundles.FileDrop, {
      args: { id: 'drop' },
      onOut: out => model => ({
        model: {
          ...model,
          told: [
            ...model.told,
            FileDrop.OutMessage.match(out, {
              ReceivedFiles: ({ files }) => files.map(file => file.name).join(','),
              RejectedNonFiles: () => 'rejected',
            }),
          ],
        },
      }),
    }),
  )
  const start = () => App.placements.initial({ told: [] }).model
  const fold = App.placements.update(model => ({ model }))
  const zone = (message: FileDrop.Message) => App.Message.GotZoneMessage({ message })

  it('starts as upstream does, and tracks a drag over it', () => {
    expect(start().zone).toEqual(UiFileDrop.init({ id: 'drop' }))
    expect(fold(start(), zone(FileDrop.Message.EnteredDragZone())).model.zone.isDragOver).toBe(true)
  })

  it('reports the files dropped, and a drop of no files', () => {
    const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.png')] as const
    const dropped = fold(start(), zone(FileDrop.Message.DroppedFiles({ files }))).model
    const refused = fold(dropped, zone(FileDrop.Message.DroppedNonFiles())).model
    expect(refused.told).toEqual(['a.txt,b.png', 'rejected'])
    expect(refused.zone.isDragOver).toBe(false)
  })
})
