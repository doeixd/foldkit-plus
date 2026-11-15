/**
 * The demo's own Slot contracts: what its views draw, apart from the Styles in
 * `style.ts` (a module evaluated at build, which exports data only).
 */
import { Attr, Capability, Slot, Slots } from 'foldkit-mixins'

export const PageSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  header: Slot.make({ capability: Capability.Container }),
  eyebrow: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  lede: Slot.make({ capability: Capability.Container }),
  controlLabel: Slot.make({ capability: Capability.Container }),
  section: Slot.make({ capability: Capability.Container }),
  /** An island's content: the section's text and controls, stacked. */
  body: Slot.make({ capability: Capability.Container }),
  /** Where an island draws; it keeps a height so the page does not jump as islands arrive. */
  island: Slot.make({ capability: Capability.Container }),
  sectionTitle: Slot.make({ capability: Capability.Container }),
  sectionText: Slot.make({ capability: Capability.Container }),
  /** A result count, read aloud when it changes. */
  live: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
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

/** The theme studio: the panel that moves the knobs, and the specimen that shows them move. */
export const StudioSlots = Slots.define({
  studio: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({ capability: Capability.Container }),
  group: Slot.make({ capability: Capability.Container }),
  groupLabel: Slot.make({ capability: Capability.Container }),
  sliders: Slot.make({ capability: Capability.Container }),
  hint: Slot.make({ capability: Capability.Container }),
  actions: Slot.make({ capability: Capability.Container }),
  /** The live region that says what was applied, drawn off-screen. */
  status: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  specimen: Slot.make({ capability: Capability.Container }),
  specimenRow: Slot.make({ capability: Capability.Container }),
  specimenLabel: Slot.make({ capability: Capability.Container }),
})

/** The tokens table: each row's name, its expression, and a bar the token itself sizes. */
export const TokenSlots = Slots.define({
  table: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
  name: Slot.make({ capability: Capability.Container }),
  bar: Slot.make({ capability: Capability.Container }),
  expression: Slot.make({ capability: Capability.Container }),
})

/** Four boxes that set one property from different layers: the nearest the app wins, then `Style.inline` beats all. */
export const CascadeSlots = Slots.define({
  row: Slot.make({ capability: Capability.Container }),
  base: Slot.make({ capability: Capability.Container }),
  variant: Slot.make({ capability: Capability.Container }),
  app: Slot.make({ capability: Capability.Container }),
  inline: Slot.make({ capability: Capability.Container }),
})

/** A list of dismissible alerts and its Add button: the owner and parts of its `FocusRecovery`. */
export const NoticeAlertSlots = Slots.define({
  group: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  /** The fallback part: where focus goes when the last alert is gone. */
  add: Slot.make({ capability: Capability.Interactive }),
  /** Drawn by each Alert, which marks its own dismiss button; named here for `parts`. */
  dismiss: Slot.make({ capability: Capability.Interactive }),
})
