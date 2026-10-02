import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import {
  DismissLayer,
  GridNavigation,
  ListNavigation,
  Press,
  RovingTabindex,
  TreeNavigation,
} from '../../src/interaction/index.js'

// Start with one: a toolbar with a roving tab stop
const Tool = Schema.Struct({ id: Schema.String, label: Schema.String, disabled: Schema.Boolean })
type Tool = typeof Tool.Type

const Roving = Bundle.declare(RovingTabindex.bundle, 'toolbarFocus')
const Model = Schema.Struct({ ...Roving.fields, tools: Schema.Array(Tool) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Roving.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const args = { orientation: 'horizontal', loop: true, virtual: false } as const
const placements = Page.assemble(Page.at(Roving, { args }))
void placements

const ToolbarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  tool: Slot.make({ capability: Capability.Focusable }),
})
const describeTools = (tools: ReadonlyArray<Tool>) =>
  Behaviors.Collection.of(tools, { id: tool => tool.id, disabled: tool => tool.disabled })

const Ids = Behaviors.Collection.behavior(ToolbarSlots)<Model, Message>({
  item: 'tool',
  items: model => describeTools(model.tools),
})
const Focus = RovingTabindex.behavior(Roving, args)(ToolbarSlots)<Model, Message>({
  container: 'root',
  item: 'tool',
  items: model => describeTools(model.tools),
})

const Toolbar = SlotView.forMessages<Message>()
  .define(ToolbarSlots, (model: Model, slots, h) => {
    const items = describeTools(model.tools)
    return h.div(
      slots.root.attrs([h.Role('toolbar')]),
      model.tools.map((tool, index) =>
        h.button(slots.tool.attrs([h.Key(tool.id)], items.slotItem(index)), [tool.label]),
      ),
    )
  })
  .pipe(Behavior.attach(Ids), Behavior.attach(Focus))
void Toolbar

// ListNavigation
const Fruit = Schema.Struct({ id: Schema.String, label: Schema.String })
type Fruit = typeof Fruit.Type
const describeFruits = (fruits: ReadonlyArray<Fruit>) =>
  Behaviors.Collection.of(fruits, { id: fruit => fruit.id })
const ListSlots = Slots.define({
  list: Slot.make({ capability: Capability.Container }),
  option: Slot.make({ capability: Capability.Focusable }),
})
const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
const ListModel = Schema.Struct({ ...Nav.fields, fruits: Schema.Array(Fruit) })
type ListModel = typeof ListModel.Type
const ListMessage = defineMessageUnion({ ...Nav.cases })
type ListMessage = typeof ListMessage.Type
const navArgs = {
  orientation: 'vertical',
  loop: false,
  virtual: false,
  timeoutMs: 500,
  page: 10,
} as const
const Keys = ListNavigation.behavior(Nav, navArgs)(ListSlots)<ListModel, ListMessage>({
  container: 'list',
  item: 'option',
  items: model => describeFruits(model.fruits),
  text: (model, index) => model.fruits[index]?.label ?? '',
})
void Keys

// GridNavigation
const Day = Schema.Struct({ id: Schema.String })
type Day = typeof Day.Type
const describeDays = (days: ReadonlyArray<Day>) =>
  Behaviors.Collection.of(days, { id: day => day.id })
const CalendarSlots = Slots.define({
  grid: Slot.make({ capability: Capability.Container }),
  day: Slot.make({ capability: Capability.Focusable }),
})
const Cells = Bundle.declare(GridNavigation.bundle, 'cells')
const CalendarModel = Schema.Struct({ ...Cells.fields, days: Schema.Array(Day) })
type CalendarModel = typeof CalendarModel.Type
const CalendarMessage = defineMessageUnion({ ...Cells.cases })
type CalendarMessage = typeof CalendarMessage.Type
const gridArgs = { columns: 7, wrap: false, virtual: false } as const
const DayKeys = GridNavigation.behavior(Cells, gridArgs)(CalendarSlots)<
  CalendarModel,
  CalendarMessage
>({
  container: 'grid',
  item: 'day',
  items: model => describeDays(model.days),
})
void DayKeys

// TreeNavigation
const Folder = Schema.Struct({
  id: Schema.String,
  parent: Schema.NullOr(Schema.String),
  hasChildren: Schema.Boolean,
})
const TreeSlots = Slots.define({
  tree: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Focusable }),
})
const Layers = Bundle.declare(TreeNavigation.bundle, 'layers')
const TreeModel = Schema.Struct({ ...Layers.fields, folders: Schema.Array(Folder) })
type TreeModel = typeof TreeModel.Type
const TreeMessage = defineMessageUnion({ ...Layers.cases })
type TreeMessage = typeof TreeMessage.Type
const TreeKeys = TreeNavigation.behavior(Layers, { openByDefault: true })(TreeSlots)<
  TreeModel,
  TreeMessage
>({
  container: 'tree',
  item: 'row',
  rows: model =>
    model.folders.map(folder => ({
      id: folder.id,
      parent: folder.parent,
      branch: folder.hasChildren,
    })),
})
void TreeKeys

// Press
const CardSlots = Slots.define({ save: Slot.make({ capability: Capability.Interactive }) })
const Button = Bundle.declare(Press.bundle, 'saveButton')
const CardModel = Schema.Struct({ ...Button.fields, saving: Schema.Boolean })
type CardModel = typeof CardModel.Type
const CardMessage = defineMessageUnion({ ...Button.cases, Saved: {} })
type CardMessage = typeof CardMessage.Type
const CardPage = Bundle.parent({ Model: CardModel, Message: CardMessage })
const save = (_model: CardModel) => ({ name: 'save', effect: Effect.succeed(CardMessage.Saved()) })
const pressed = CardPage.assemble(
  CardPage.at(Button, {
    args: { clickSuppressionMs: 50 },
    onOut: () => model => ({ model, commands: [save(model)] }),
  }),
)
void pressed
const Activate = Press.behavior(Button)(CardSlots)<CardModel, CardMessage>({
  target: 'save',
  disabled: model => model.saving,
})
void Activate

// DismissLayer
const MenuSlots = Slots.define({
  panel: Slot.make({ capability: Capability.Container }),
  button: Slot.make({ capability: Capability.Interactive }),
})
const Stack = Bundle.declare(DismissLayer.bundle, 'layers')
const MenuModel = Schema.Struct({ ...Stack.fields, menuOpen: Schema.Boolean })
type MenuModel = typeof MenuModel.Type
const MenuMessage = defineMessageUnion({ ...Stack.cases })
type MenuMessage = typeof MenuMessage.Type
const MenuPage = Bundle.parent({ Model: MenuModel, Message: MenuMessage })
const dismissable = MenuPage.assemble(
  MenuPage.at(Stack, {
    onOut:
      ({ ids }) =>
      model => ({ model: { ...model, menuOpen: ids.includes('menu') ? false : model.menuOpen } }),
  }),
)
void dismissable
const Dismissable = DismissLayer.behavior(Stack)(MenuSlots)<MenuModel, MenuMessage>({
  layer: 'panel',
  trigger: 'button',
  id: () => 'menu',
})
void Dismissable
