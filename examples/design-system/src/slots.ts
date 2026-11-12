/**
 * The demo's own Slot contracts: what its views draw, apart from the Styles in
 * `style.ts` (a module evaluated at build, which exports data only).
 */
import { Capability, Slot, Slots } from 'foldkit-mixins'

export const PageSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  header: Slot.make({ capability: Capability.Container }),
  eyebrow: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  lede: Slot.make({ capability: Capability.Container }),
  controls: Slot.make({ capability: Capability.Container }),
  controlGroup: Slot.make({ capability: Capability.Container }),
  controlLabel: Slot.make({ capability: Capability.Container }),
  section: Slot.make({ capability: Capability.Container }),
  sectionTitle: Slot.make({ capability: Capability.Container }),
  sectionText: Slot.make({ capability: Capability.Container }),
  swatchGrid: Slot.make({ capability: Capability.Container }),
  swatch: Slot.make({ capability: Capability.Container }),
  chip: Slot.make({ capability: Capability.Container }),
  swatchName: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
  code: Slot.make({ capability: Capability.Container }),
  footer: Slot.make({ capability: Capability.Container }),
})

export const RadioRowSlots = Slots.define({
  row: Slot.make({ capability: Capability.Container }),
  text: Slot.make({ capability: Capability.Container }),
})

export const DateChromeSlots = Slots.define({
  picker: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({ capability: Capability.Container }),
  backdrop: Slot.make({ capability: Capability.Container }),
})

export const ToastEntrySlots = Slots.define({
  title: Slot.make({ capability: Capability.Container }),
  text: Slot.make({ capability: Capability.Container }),
  dismiss: Slot.make({ capability: Capability.Container }),
})

export const FileTextSlots = Slots.define({
  primary: Slot.make({ capability: Capability.Container }),
  secondary: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
  fileName: Slot.make({ capability: Capability.Container }),
})

export const InputGroupSlots = Slots.define({
  group: Slot.make({ capability: Capability.Container }),
  affix: Slot.make({ capability: Capability.Container }),
  control: Slot.make({ capability: Capability.TextInput, events: [] }),
})

export const IconSlots = Slots.define({
  row: Slot.make({ capability: Capability.Container }),
  chip: Slot.make({ capability: Capability.Container }),
})

export const BadgeSlots = Slots.define({
  row: Slot.make({ capability: Capability.Container }),
  badge: Slot.make({ capability: Capability.Container }),
})

export const DialogActionsSlots = Slots.define({
  actions: Slot.make({ capability: Capability.Container }),
})

export const NoticeListSlots = Slots.define({
  list: Slot.make({ capability: Capability.Container }),
})
