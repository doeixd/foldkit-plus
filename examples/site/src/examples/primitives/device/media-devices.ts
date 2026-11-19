import { mediaDevices, MediaDevicesMessage } from 'foldkit-primitives/device'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const Devices = mediaDevices({ name: 'Devices' })

// `init` scans at once; a served page cannot run a Command, so the scan is a press instead.
export default primitiveExample({
  title: 'mediaDevices',
  text: '`mediaDevices` lists the cameras and microphones present and rescans when one is plugged in or out. Listing asks for no permission, so labels stay empty until the page has used a device.',
  state: {
    Model: Devices.Model,
    Message: Devices.Message,
    init: () => ({ model: Devices.init().model }),
    update: (model, message) => Devices.update(model, message),
  },
  view: ({ model, onMessage, slots, h }) =>
    h.p(
      [],
      [
        h.button(
          slots.liveButton.attrs([
            h.Type('button'),
            h.OnClick(onMessage(MediaDevicesMessage.Scan())),
          ]),
          ['Look for devices'],
        ),
        model.status === 'ready'
          ? ` ${model.devices.filter(device => device.kind === 'videoinput').length} cameras, ${model.devices.filter(device => device.kind === 'audioinput').length} microphones.`
          : model.status === 'denied'
            ? ' The browser refused to list devices.'
            : ' Not scanned yet.',
      ],
    ),
})
