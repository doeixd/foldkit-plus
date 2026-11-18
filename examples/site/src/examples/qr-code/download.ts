import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Button, ButtonSlots, QrCode, QrCodeSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'
import { row, stack } from '../../snippets/layout.js'

const Save = forSlots(ButtonSlots)(Recipes.Button({ variant: 'outline', size: 'sm' }))

const Model = Schema.Struct({ saved: Schema.Array(QrCode.Format) })
// `Downloaded` and `DownloadFailed` are what `QrCode.Download` answers.
const Message = defineMessageUnion({
  Pressed: { format: QrCode.Format },
  Downloaded: { format: QrCode.Format },
  DownloadFailed: { message: Schema.String },
})

// The buttons send a Message; `update` answers it with `QrCode.Download`,
// which saves the drawn code in the colours the page shows it in.
export default example({
  title: 'Saved as a PNG or an SVG',
  slots: QrCodeSlots,
  recipe: Recipes.QrCode,
  state: {
    Model,
    Message,
    init: () => ({ model: { saved: [] } }),
    update: (model, message) =>
      Message.match(message, {
        Pressed: ({ format }) => ({
          model,
          commands: [
            QrCode.Download({ id: 'wifi-qr', format, filename: 'guest-wifi', pixels: 512 }),
          ],
        }),
        Downloaded: ({ format }) => ({ model: { saved: [...model.saved, format] } }),
        DownloadFailed: () => ({ model }),
      }),
  },
  view: ({ style, onMessage, h }) =>
    stack(h, [
      QrCode.view({ id: 'wifi-qr', value: 'WIFI:T:WPA;S:Guests;P:welcome-in;;', style }, h),
      row(h, [
        Button.view(
          {
            label: 'Download PNG',
            onClick: onMessage(Message.Pressed({ format: 'png' })),
            style: Save,
          },
          h,
        ),
        Button.view(
          {
            label: 'Download SVG',
            onClick: onMessage(Message.Pressed({ format: 'svg' })),
            style: Save,
          },
          h,
        ),
      ]),
    ]),
})
