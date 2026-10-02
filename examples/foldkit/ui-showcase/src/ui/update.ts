import { Array, Number, Option, pipe } from 'effect'
import { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  Animation,
  Calendar,
  Combobox,
  DatePicker,
  Dialog,
  DragAndDrop,
  FileDrop,
  HoverIntent,
  Listbox,
  Menu,
  Popover,
  RadioGroup,
  Slider,
  Tabs,
  Tooltip,
  VirtualList,
} from '@foldkit/ui'
import { Link } from 'foldkit-bundle'

import { Message as UiMessage } from './message.js'
import type { City, DemoColumn, DemoTab, ListboxItem, Plan, UiModel } from './model.js'
import { Toast } from './toast.js'
import { CityCombobox, CityMultiCombobox } from './view/combobox.js'
import { CharacterListbox, ItemListbox, ItemMultiListbox } from './view/listbox.js'
import { PlanRadioGroup } from './view/radioGroup.js'
import { DemoTabs } from './view/tabs.js'
import {
  ROW_COUNT as VIRTUAL_LIST_ROW_COUNT,
  variableActivities,
  variableRowHeightPx,
} from './view/virtualList.js'

const reorderColumns = (
  columns: ReadonlyArray<DemoColumn>,
  itemId: string,
  fromContainerId: string,
  toContainerId: string,
  toIndex: number,
): ReadonlyArray<DemoColumn> => {
  const maybeCard = pipe(
    columns,
    Array.findFirst(({ id }) => id === fromContainerId),
    Option.flatMap(column => Array.findFirst(column.cards, ({ id }) => id === itemId)),
  )

  return Option.match(maybeCard, {
    onNone: () => columns,
    onSome: card =>
      Array.map(columns, column => {
        const withRemoved =
          column.id === fromContainerId
            ? Array.filter(column.cards, ({ id }) => id !== itemId)
            : column.cards

        if (column.id !== toContainerId) {
          return modifyFields(column, { cards: () => withRemoved })
        }

        const inserted = [
          ...Array.take(withRemoved, toIndex),
          card,
          ...Array.drop(withRemoved, toIndex),
        ]

        return modifyFields(column, { cards: () => inserted })
      }),
  })
}

const DemoMenu = Menu.create<string>()

// Where each component lives: its UiModel field and its Got*Message variant.
// Spread into Update.foldChild, a Link is the fold's read, write and
// toParentMessage, and its write keeps UiModel when the component is unchanged.
const Ui = Link.field<UiModel>()

const mobileMenuDialog = Ui('mobileMenuDialog', Link.wrapper(UiMessage.GotMobileMenuDialogMessage))
const comboboxDemo = Ui('comboboxDemo', Link.wrapper(UiMessage.GotComboboxDemoMessage))
const comboboxNullableDemo = Ui(
  'comboboxNullableDemo',
  Link.wrapper(UiMessage.GotComboboxNullableDemoMessage),
)
const comboboxMultiDemo = Ui(
  'comboboxMultiDemo',
  Link.wrapper(UiMessage.GotComboboxMultiDemoMessage),
)
const comboboxPlacementLockDemo = Ui(
  'comboboxPlacementLockDemo',
  Link.wrapper(UiMessage.GotComboboxPlacementLockDemoMessage),
)
const comboboxSelectOnFocusDemo = Ui(
  'comboboxSelectOnFocusDemo',
  Link.wrapper(UiMessage.GotComboboxSelectOnFocusDemoMessage),
)
const dialogDemo = Ui('dialogDemo', Link.wrapper(UiMessage.GotDialogDemoMessage))
const dialogAnimatedDemo = Ui(
  'dialogAnimatedDemo',
  Link.wrapper(UiMessage.GotDialogAnimatedDemoMessage),
)
const overlayDialogDemo = Ui(
  'overlayDialogDemo',
  Link.wrapper(UiMessage.GotOverlayDialogDemoMessage),
)
const overlayComboboxDemo = Ui(
  'overlayComboboxDemo',
  Link.wrapper(UiMessage.GotOverlayComboboxDemoMessage),
)
const nestedDialogParentDemo = Ui(
  'nestedDialogParentDemo',
  Link.wrapper(UiMessage.GotNestedDialogParentDemoMessage),
)
const nestedDialogChildDemo = Ui(
  'nestedDialogChildDemo',
  Link.wrapper(UiMessage.GotNestedDialogChildDemoMessage),
)
const calendarBasicDemo = Ui(
  'calendarBasicDemo',
  Link.wrapper(UiMessage.GotCalendarBasicDemoMessage),
)
const datePickerBasicDemo = Ui(
  'datePickerBasicDemo',
  Link.wrapper(UiMessage.GotDatePickerBasicDemoMessage),
)
const dragAndDropDemo = Ui('dragAndDropDemo', Link.wrapper(UiMessage.GotDragAndDropDemoMessage))
const fileDropBasicDemo = Ui(
  'fileDropBasicDemo',
  Link.wrapper(UiMessage.GotFileDropBasicDemoMessage),
)
const listboxDemo = Ui('listboxDemo', Link.wrapper(UiMessage.GotListboxDemoMessage))
const listboxMultiDemo = Ui('listboxMultiDemo', Link.wrapper(UiMessage.GotListboxMultiDemoMessage))
const listboxGroupedDemo = Ui(
  'listboxGroupedDemo',
  Link.wrapper(UiMessage.GotListboxGroupedDemoMessage),
)
const menuBasicDemo = Ui('menuBasicDemo', Link.wrapper(UiMessage.GotMenuBasicDemoMessage))
const menuAnimatedDemo = Ui('menuAnimatedDemo', Link.wrapper(UiMessage.GotMenuAnimatedDemoMessage))
const popoverBasicDemo = Ui('popoverBasicDemo', Link.wrapper(UiMessage.GotPopoverBasicDemoMessage))
const popoverAnimatedDemo = Ui(
  'popoverAnimatedDemo',
  Link.wrapper(UiMessage.GotPopoverAnimatedDemoMessage),
)
const popoverNestedParentDemo = Ui(
  'popoverNestedParentDemo',
  Link.wrapper(UiMessage.GotPopoverNestedParentDemoMessage),
)
const popoverNestedChildDemo = Ui(
  'popoverNestedChildDemo',
  Link.wrapper(UiMessage.GotPopoverNestedChildDemoMessage),
)
const verticalRadioGroupDemo = Ui(
  'verticalRadioGroupDemo',
  Link.wrapper(UiMessage.GotVerticalRadioGroupDemoMessage),
)
const horizontalRadioGroupDemo = Ui(
  'horizontalRadioGroupDemo',
  Link.wrapper(UiMessage.GotHorizontalRadioGroupDemoMessage),
)
const sliderRatingDemo = Ui('sliderRatingDemo', Link.wrapper(UiMessage.GotSliderRatingDemoMessage))
const sliderVolumeDemo = Ui('sliderVolumeDemo', Link.wrapper(UiMessage.GotSliderVolumeDemoMessage))
const horizontalTabsDemo = Ui(
  'horizontalTabsDemo',
  Link.wrapper(UiMessage.GotHorizontalTabsDemoMessage),
)
const verticalTabsDemo = Ui('verticalTabsDemo', Link.wrapper(UiMessage.GotVerticalTabsDemoMessage))
const toastDemo = Ui('toastDemo', Link.wrapper(UiMessage.GotToastDemoMessage))
const tooltipBasicDemo = Ui('tooltipBasicDemo', Link.wrapper(UiMessage.GotTooltipBasicDemoMessage))
const tooltipNoDelayDemo = Ui(
  'tooltipNoDelayDemo',
  Link.wrapper(UiMessage.GotTooltipNoDelayDemoMessage),
)
const hoverIntentDemo = Ui('hoverIntentDemo', Link.wrapper(UiMessage.GotHoverIntentDemoMessage))
const animationDemo = Ui('animationDemo', Link.wrapper(UiMessage.GotAnimationDemoMessage))
const virtualListDemo = Ui('virtualListDemo', Link.wrapper(UiMessage.GotVirtualListDemoMessage))
const virtualListVariableDemo = Ui(
  'virtualListVariableDemo',
  Link.wrapper(UiMessage.GotVirtualListVariableDemoMessage),
)

const foldDialogOutMessage = Dialog.OutMessage.match<Update.Step<UiModel, UiMessage>>({
  Opened: () => model => ({ model }),
  Closed: () => model => ({ model }),
})

const foldMenuOutMessage = Menu.OutMessage.match<
  Update.Step<UiModel, UiMessage>,
  Menu.OutMessage<string>
>({
  Selected: () => model => ({ model }),
})

const foldPopoverOutMessage = Popover.OutMessage.match<Update.Step<UiModel, UiMessage>>({
  Opened: () => model => ({ model }),
  Closed: () => model => ({ model }),
})

const foldToastOutMessage = Toast.OutMessage.match<Update.Step<UiModel, UiMessage>>({
  DismissedToast: () => model => ({ model }),
})

const foldTooltipOutMessage = Tooltip.OutMessage.match<Update.Step<UiModel, UiMessage>>({
  Shown: () => model => ({ model }),
  Hidden: () => model => ({ model }),
})

const foldHoverIntentOutMessage = HoverIntent.OutMessage.match<Update.Step<UiModel, UiMessage>>({
  Opened: () => model => ({ model }),
  Closed: () => model => ({ model }),
})

const foldMobileMenuDialog = Update.foldChild({
  ...mobileMenuDialog,
  update: Dialog.update,
  foldOutMessage: foldDialogOutMessage,
})

const foldMobileMenuDialogOpen = Update.foldChildStep({
  ...mobileMenuDialog,
  update: Dialog.open,
  foldOutMessage: foldDialogOutMessage,
})

const foldMobileMenuDialogClose = Update.foldChildStep({
  ...mobileMenuDialog,
  update: Dialog.close,
  foldOutMessage: foldDialogOutMessage,
})

const foldComboboxDemo = Update.foldChild({
  ...comboboxDemo,
  update: CityCombobox.update,
  foldOutMessage: Combobox.OutMessage.match<
    Update.Step<UiModel, UiMessage>,
    Combobox.OutMessage<City>
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          maybeComboboxDemoSelectedCity: () => Option.some(value),
        }),
      }),
    ClearedSelection: () => model => ({ model }),
  }),
})

const foldComboboxNullableDemo = Update.foldChild({
  ...comboboxNullableDemo,
  update: CityCombobox.update,
  foldOutMessage: Combobox.OutMessage.match<
    Update.Step<UiModel, UiMessage>,
    Combobox.OutMessage<City>
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          maybeComboboxNullableDemoSelectedCity: maybeComboboxNullableDemoSelectedCity =>
            Option.contains(maybeComboboxNullableDemoSelectedCity, value)
              ? Option.none()
              : Option.some(value),
        }),
      }),
    ClearedSelection: () => model => ({
      model: modifyFields(model, {
        maybeComboboxNullableDemoSelectedCity: () => Option.none(),
      }),
    }),
  }),
})

const foldComboboxMultiDemo = Update.foldChild({
  ...comboboxMultiDemo,
  update: CityMultiCombobox.update,
  foldOutMessage: Combobox.OutMessage.match<
    Update.Step<UiModel, UiMessage>,
    Combobox.OutMessage<City>
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          comboboxMultiDemoSelectedCities: comboboxMultiDemoSelectedCities =>
            Array.contains(comboboxMultiDemoSelectedCities, value)
              ? Array.filter(comboboxMultiDemoSelectedCities, city => city !== value)
              : Array.append(comboboxMultiDemoSelectedCities, value),
        }),
      }),
    ClearedSelection: () => model => ({ model }),
  }),
})

const foldComboboxPlacementLockDemo = Update.foldChild({
  ...comboboxPlacementLockDemo,
  update: CityCombobox.update,
  foldOutMessage: Combobox.OutMessage.match<
    Update.Step<UiModel, UiMessage>,
    Combobox.OutMessage<City>
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          maybeComboboxPlacementLockDemoSelectedCity: () => Option.some(value),
        }),
      }),
    ClearedSelection: () => model => ({ model }),
  }),
})

const foldComboboxSelectOnFocusDemo = Update.foldChild({
  ...comboboxSelectOnFocusDemo,
  update: CityCombobox.update,
  foldOutMessage: Combobox.OutMessage.match<
    Update.Step<UiModel, UiMessage>,
    Combobox.OutMessage<City>
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          maybeComboboxSelectOnFocusDemoSelectedCity: () => Option.some(value),
        }),
      }),
    ClearedSelection: () => model => ({ model }),
  }),
})

const foldDialogDemo = Update.foldChild({
  ...dialogDemo,
  update: Dialog.update,
  foldOutMessage: foldDialogOutMessage,
})

const foldDialogDemoOpen = Update.foldChildStep({
  ...dialogDemo,
  update: Dialog.open,
  foldOutMessage: foldDialogOutMessage,
})

const foldDialogAnimatedDemo = Update.foldChild({
  ...dialogAnimatedDemo,
  update: Dialog.update,
  foldOutMessage: foldDialogOutMessage,
})

const foldDialogAnimatedDemoOpen = Update.foldChildStep({
  ...dialogAnimatedDemo,
  update: Dialog.open,
  foldOutMessage: foldDialogOutMessage,
})

const foldOverlayDialogDemo = Update.foldChild({
  ...overlayDialogDemo,
  update: Dialog.update,
  foldOutMessage: foldDialogOutMessage,
})

const foldOverlayDialogDemoOpen = Update.foldChildStep({
  ...overlayDialogDemo,
  update: Dialog.open,
  foldOutMessage: foldDialogOutMessage,
})

const foldOverlayComboboxDemo = Update.foldChild({
  ...overlayComboboxDemo,
  update: CityCombobox.update,
  foldOutMessage: Combobox.OutMessage.match<
    Update.Step<UiModel, UiMessage>,
    Combobox.OutMessage<City>
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          maybeOverlayComboboxDemoSelectedCity: () => Option.some(value),
        }),
      }),
    ClearedSelection: () => model => ({ model }),
  }),
})

const foldNestedDialogParentDemo = Update.foldChild({
  ...nestedDialogParentDemo,
  update: Dialog.update,
  foldOutMessage: foldDialogOutMessage,
})

const foldNestedDialogParentDemoOpen = Update.foldChildStep({
  ...nestedDialogParentDemo,
  update: Dialog.open,
  foldOutMessage: foldDialogOutMessage,
})

const foldNestedDialogChildDemo = Update.foldChild({
  ...nestedDialogChildDemo,
  update: Dialog.update,
  foldOutMessage: foldDialogOutMessage,
})

const foldNestedDialogChildDemoOpen = Update.foldChildStep({
  ...nestedDialogChildDemo,
  update: Dialog.open,
  foldOutMessage: foldDialogOutMessage,
})

const foldCalendarBasicDemo = Update.foldChild({
  ...calendarBasicDemo,
  update: Calendar.update,
  foldOutMessage: Calendar.OutMessage.match<Update.Step<UiModel, UiMessage>>({
    SelectedDate:
      ({ date }) =>
      model => ({
        model: modifyFields(model, {
          maybeCalendarBasicDemoSelectedDate: () => Option.some(date),
        }),
      }),
    ChangedViewMonth: () => model => ({ model }),
  }),
})

const foldDatePickerBasicDemo = Update.foldChild({
  ...datePickerBasicDemo,
  update: DatePicker.update,
  foldOutMessage: DatePicker.OutMessage.match<Update.Step<UiModel, UiMessage>>({
    SelectedDate:
      ({ date }) =>
      model => ({
        model: modifyFields(model, {
          maybeDatePickerBasicDemoSelectedDate: () => Option.some(date),
        }),
      }),
    ClearedDate: () => model => ({
      model: modifyFields(model, {
        maybeDatePickerBasicDemoSelectedDate: () => Option.none(),
      }),
    }),
    ChangedViewMonth: () => model => ({ model }),
  }),
})

const foldDragAndDropDemo = Update.foldChild({
  ...dragAndDropDemo,
  update: DragAndDrop.update,
  foldOutMessage: DragAndDrop.OutMessage.match<Update.Step<UiModel, UiMessage>>({
    Reordered:
      ({ itemId, fromContainerId, toContainerId, toIndex }) =>
      model => ({
        model: modifyFields(model, {
          dragAndDropDemoColumns: dragAndDropDemoColumns =>
            reorderColumns(dragAndDropDemoColumns, itemId, fromContainerId, toContainerId, toIndex),
        }),
      }),
    Cancelled: () => model => ({ model }),
  }),
})

const foldFileDropBasicDemo = Update.foldChild({
  ...fileDropBasicDemo,
  update: FileDrop.update,
  foldOutMessage: FileDrop.OutMessage.match<Update.Step<UiModel, UiMessage>>({
    ReceivedFiles:
      ({ files }) =>
      model => ({
        model: modifyFields(model, {
          fileDropBasicDemoFiles: Array.appendAll(files),
        }),
      }),
    RejectedNonFiles: () => model => ({ model }),
  }),
})

const foldListboxDemo = Update.foldChild({
  ...listboxDemo,
  update: ItemListbox.update,
  foldOutMessage: Listbox.OutMessage.match<
    Update.Step<UiModel, UiMessage>,
    Listbox.OutMessage<ListboxItem>
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          maybeListboxDemoSelectedItem: () => Option.some(value),
        }),
      }),
  }),
})

const foldListboxMultiDemo = Update.foldChild({
  ...listboxMultiDemo,
  update: ItemMultiListbox.update,
  foldOutMessage: Listbox.OutMessage.match<
    Update.Step<UiModel, UiMessage>,
    Listbox.OutMessage<ListboxItem>
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          listboxMultiDemoSelectedItems: listboxMultiDemoSelectedItems =>
            Array.contains(listboxMultiDemoSelectedItems, value)
              ? Array.filter(listboxMultiDemoSelectedItems, item => item !== value)
              : Array.append(listboxMultiDemoSelectedItems, value),
        }),
      }),
  }),
})

const foldListboxGroupedDemo = Update.foldChild({
  ...listboxGroupedDemo,
  update: CharacterListbox.update,
  foldOutMessage: Listbox.OutMessage.match<Update.Step<UiModel, UiMessage>>({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          maybeListboxGroupedDemoSelectedItem: () => Option.some(value),
        }),
      }),
  }),
})

const foldMenuBasicDemo = Update.foldChild({
  ...menuBasicDemo,
  update: DemoMenu.update,
  foldOutMessage: foldMenuOutMessage,
})

const foldMenuAnimatedDemo = Update.foldChild({
  ...menuAnimatedDemo,
  update: DemoMenu.update,
  foldOutMessage: foldMenuOutMessage,
})

const foldPopoverBasicDemo = Update.foldChild({
  ...popoverBasicDemo,
  update: Popover.update,
  foldOutMessage: foldPopoverOutMessage,
})

const foldPopoverAnimatedDemo = Update.foldChild({
  ...popoverAnimatedDemo,
  update: Popover.update,
  foldOutMessage: foldPopoverOutMessage,
})

const foldPopoverNestedParentDemo = Update.foldChild({
  ...popoverNestedParentDemo,
  update: Popover.update,
  foldOutMessage: foldPopoverOutMessage,
})

const foldPopoverNestedChildDemo = Update.foldChild({
  ...popoverNestedChildDemo,
  update: Popover.update,
  foldOutMessage: foldPopoverOutMessage,
})

const foldVerticalRadioGroupDemo = Update.foldChild({
  ...verticalRadioGroupDemo,
  update: PlanRadioGroup.update,
  foldOutMessage: RadioGroup.OutMessage.match<
    Update.Step<UiModel, UiMessage>,
    RadioGroup.OutMessage<Plan>
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          verticalRadioGroupDemoValue: () => Option.some(value),
        }),
      }),
  }),
})

const foldHorizontalRadioGroupDemo = Update.foldChild({
  ...horizontalRadioGroupDemo,
  update: PlanRadioGroup.update,
  foldOutMessage: RadioGroup.OutMessage.match<
    Update.Step<UiModel, UiMessage>,
    RadioGroup.OutMessage<Plan>
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          horizontalRadioGroupDemoValue: () => Option.some(value),
        }),
      }),
  }),
})

const foldSliderRatingDemo = Update.foldChild({
  ...sliderRatingDemo,
  update: Slider.update,
  foldOutMessage: Slider.OutMessage.match<Update.Step<UiModel, UiMessage>>({
    ChangedValue:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { sliderRatingValue: () => value }),
      }),
  }),
})

const foldSliderVolumeDemo = Update.foldChild({
  ...sliderVolumeDemo,
  update: Slider.update,
  foldOutMessage: Slider.OutMessage.match<Update.Step<UiModel, UiMessage>>({
    ChangedValue:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { sliderVolumeValue: () => value }),
      }),
  }),
})

const foldHorizontalTabsDemo = Update.foldChild({
  ...horizontalTabsDemo,
  update: DemoTabs.update,
  foldOutMessage: Tabs.OutMessage.match<Update.Step<UiModel, UiMessage>, Tabs.OutMessage<DemoTab>>({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { horizontalTabsDemoTab: () => value }),
      }),
  }),
})

const foldVerticalTabsDemo = Update.foldChild({
  ...verticalTabsDemo,
  update: DemoTabs.update,
  foldOutMessage: Tabs.OutMessage.match<Update.Step<UiModel, UiMessage>, Tabs.OutMessage<DemoTab>>({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { verticalTabsDemoTab: () => value }),
      }),
  }),
})

const foldToastDemo = Update.foldChild({
  ...toastDemo,
  update: Toast.update,
  foldOutMessage: foldToastOutMessage,
})

const foldToastDemoShow = Update.foldChild({
  ...toastDemo,
  update: Toast.show,
  foldOutMessage: foldToastOutMessage,
})

const foldToastDemoDismissAll = Update.foldChildStep({
  ...toastDemo,
  update: Toast.dismissAll,
  foldOutMessage: foldToastOutMessage,
})

const foldTooltipBasicDemo = Update.foldChild({
  ...tooltipBasicDemo,
  update: Tooltip.update,
  foldOutMessage: foldTooltipOutMessage,
})

const foldTooltipNoDelayDemo = Update.foldChild({
  ...tooltipNoDelayDemo,
  update: Tooltip.update,
  foldOutMessage: foldTooltipOutMessage,
})

const foldHoverIntentDemo = Update.foldChild({
  ...hoverIntentDemo,
  update: HoverIntent.update,
  foldOutMessage: foldHoverIntentOutMessage,
})

const foldAnimationDemoOutMessage: (
  outMessage: Animation.OutMessage,
  context: Update.FoldContext<Animation.Message, UiMessage>,
) => Update.Step<UiModel, UiMessage> = (outMessage, { liftCommand }) =>
  Animation.OutMessage.match<Update.Step<UiModel, UiMessage>>(outMessage, {
    StartedLeaveAnimating: () => model => ({
      model,
      commands: [liftCommand(Animation.defaultLeaveCommand(model.animationDemo))],
    }),
    TransitionedOut: () => model => ({ model }),
  })

const foldAnimationDemo = Update.foldChild({
  ...animationDemo,
  update: Animation.update,
  foldOutMessage: foldAnimationDemoOutMessage,
})

const foldAnimationDemoShow = Update.foldChildStep({ ...animationDemo, update: Animation.show })

const foldAnimationDemoHide = Update.foldChildStep({ ...animationDemo, update: Animation.hide })

const foldVirtualListDemo = Update.foldChild({ ...virtualListDemo, update: VirtualList.update })

const foldVirtualListDemoScrollToIndex = Update.foldChild({
  ...virtualListDemo,
  update: VirtualList.scrollToIndex,
})

const foldVirtualListVariableDemo = Update.foldChild({
  ...virtualListVariableDemo,
  update: VirtualList.update,
})

const foldVirtualListVariableDemoScrollToIndex = Update.foldChild({
  ...virtualListVariableDemo,
  update: (virtualList: VirtualList.Model, index: number) =>
    VirtualList.scrollToIndexVariable(virtualList, variableActivities, variableRowHeightPx, index),
})

export const uiUpdate = (model: UiModel, message: UiMessage) =>
  UiMessage.match<Update.Return<UiModel, UiMessage>>(message, {
    GotMobileMenuDialogMessage: ({ message }) => foldMobileMenuDialog(model, message),

    UpdatedInputDemoValue: ({ value }) => ({
      model: modifyFields(model, { inputDemoValue: () => value }),
    }),

    UpdatedTextareaDemoValue: ({ value }) => ({
      model: modifyFields(model, { textareaDemoValue: () => value }),
    }),

    UpdatedFieldsetInputValue: ({ value }) => ({
      model: modifyFields(model, { fieldsetInputValue: () => value }),
    }),

    UpdatedFieldsetTextareaValue: ({ value }) => ({
      model: modifyFields(model, { fieldsetTextareaValue: () => value }),
    }),

    UpdatedSelectDemoValue: ({ value }) => ({
      model: modifyFields(model, { selectDemoValue: () => value }),
    }),

    ToggledFieldsetCheckboxDemo: ({ isChecked }) => ({
      model: modifyFields(model, {
        isFieldsetCheckboxDemoChecked: () => isChecked,
      }),
    }),

    ClickedButtonDemo: () => ({
      model: modifyFields(model, {
        buttonClickCount: Number.increment,
      }),
    }),

    ToggledCheckboxBasicDemo: ({ isChecked }) => ({
      model: modifyFields(model, {
        isCheckboxBasicDemoChecked: () => isChecked,
      }),
    }),

    ToggledCheckboxAllDemo: ({ isChecked }) => ({
      model: modifyFields(model, {
        isCheckboxOptionADemoChecked: () => isChecked,
        isCheckboxOptionBDemoChecked: () => isChecked,
      }),
    }),

    ToggledCheckboxOptionADemo: ({ isChecked }) => ({
      model: modifyFields(model, {
        isCheckboxOptionADemoChecked: () => isChecked,
      }),
    }),

    ToggledCheckboxOptionBDemo: ({ isChecked }) => ({
      model: modifyFields(model, {
        isCheckboxOptionBDemoChecked: () => isChecked,
      }),
    }),

    GotComboboxDemoMessage: ({ message }) => foldComboboxDemo(model, message),

    GotComboboxNullableDemoMessage: ({ message }) => foldComboboxNullableDemo(model, message),

    GotComboboxMultiDemoMessage: ({ message }) => foldComboboxMultiDemo(model, message),

    GotComboboxPlacementLockDemoMessage: ({ message }) =>
      foldComboboxPlacementLockDemo(model, message),

    GotComboboxSelectOnFocusDemoMessage: ({ message }) =>
      foldComboboxSelectOnFocusDemo(model, message),

    GotDialogDemoMessage: ({ message }) => foldDialogDemo(model, message),

    GotDialogAnimatedDemoMessage: ({ message }) => foldDialogAnimatedDemo(model, message),

    GotOverlayDialogDemoMessage: ({ message }) => foldOverlayDialogDemo(model, message),

    GotOverlayComboboxDemoMessage: ({ message }) => foldOverlayComboboxDemo(model, message),

    GotNestedDialogParentDemoMessage: ({ message }) => foldNestedDialogParentDemo(model, message),

    GotNestedDialogChildDemoMessage: ({ message }) => foldNestedDialogChildDemo(model, message),

    ClickedDeleteProject: () => foldNestedDialogChildDemoOpen(model),

    ClickedOpenDialog: () => foldDialogDemoOpen(model),

    ClickedOpenAnimatedDialog: () => foldDialogAnimatedDemoOpen(model),

    ClickedEditFilters: () => foldOverlayDialogDemoOpen(model),

    ClickedOpenProjectSettings: () => foldNestedDialogParentDemoOpen(model),

    ToggledDisclosureBasicDemo: ({ isOpen }) => ({
      model: modifyFields(model, {
        isDisclosureBasicDemoOpen: () => isOpen,
      }),
    }),

    ToggledDisclosureAnimatedDemo: ({ isOpen }) => ({
      model: modifyFields(model, {
        isDisclosureAnimatedDemoOpen: () => isOpen,
      }),
    }),

    ToggledDisclosureCollapsedPreviewDemo: ({ isOpen }) => ({
      model: modifyFields(model, {
        isDisclosureCollapsedPreviewDemoOpen: () => isOpen,
      }),
    }),

    GotCalendarBasicDemoMessage: ({ message }) => foldCalendarBasicDemo(model, message),

    GotDatePickerBasicDemoMessage: ({ message }) => foldDatePickerBasicDemo(model, message),

    GotDragAndDropDemoMessage: ({ message }) => foldDragAndDropDemo(model, message),

    GotFileDropBasicDemoMessage: ({ message }) => foldFileDropBasicDemo(model, message),

    ClickedRemoveFileDropDemoFile: ({ fileIndex }) => ({
      model: modifyFields(model, {
        fileDropBasicDemoFiles: () => Array.remove(model.fileDropBasicDemoFiles, fileIndex),
      }),
    }),

    GotListboxDemoMessage: ({ message }) => foldListboxDemo(model, message),

    GotListboxMultiDemoMessage: ({ message }) => foldListboxMultiDemo(model, message),

    GotListboxGroupedDemoMessage: ({ message }) => foldListboxGroupedDemo(model, message),

    GotMenuBasicDemoMessage: ({ message }) => foldMenuBasicDemo(model, message),

    GotMenuAnimatedDemoMessage: ({ message }) => foldMenuAnimatedDemo(model, message),

    GotPopoverBasicDemoMessage: ({ message }) => foldPopoverBasicDemo(model, message),

    GotPopoverAnimatedDemoMessage: ({ message }) => foldPopoverAnimatedDemo(model, message),

    GotPopoverNestedParentDemoMessage: ({ message }) => foldPopoverNestedParentDemo(model, message),

    GotPopoverNestedChildDemoMessage: ({ message }) => foldPopoverNestedChildDemo(model, message),

    GotVerticalRadioGroupDemoMessage: ({ message }) => foldVerticalRadioGroupDemo(model, message),

    GotHorizontalRadioGroupDemoMessage: ({ message }) =>
      foldHorizontalRadioGroupDemo(model, message),

    GotSliderRatingDemoMessage: ({ message }) => foldSliderRatingDemo(model, message),

    GotSliderVolumeDemoMessage: ({ message }) => foldSliderVolumeDemo(model, message),

    ToggledSwitchDemo: ({ isChecked }) => ({
      model: modifyFields(model, {
        isSwitchDemoChecked: () => isChecked,
      }),
    }),

    GotHorizontalTabsDemoMessage: ({ message }) => foldHorizontalTabsDemo(model, message),

    GotVerticalTabsDemoMessage: ({ message }) => foldVerticalTabsDemo(model, message),

    GotToastDemoMessage: ({ message }) => foldToastDemo(model, message),

    ClickedShowInfoToast: () =>
      foldToastDemoShow(model, {
        variant: 'Info',
        payload: {
          title: 'Changes saved',
          maybeDescription: Option.some('Your preferences have been updated.'),
        },
      }),

    ClickedShowSuccessToast: () =>
      foldToastDemoShow(model, {
        variant: 'Success',
        payload: {
          title: 'Uploaded successfully',
          maybeDescription: Option.some('kit-manual.pdf is now available.'),
        },
      }),

    ClickedShowWarningToast: () =>
      foldToastDemoShow(model, {
        variant: 'Warning',
        payload: {
          title: 'Network slow',
          maybeDescription: Option.some('Some assets are loading over a weak connection.'),
        },
      }),

    ClickedShowErrorToast: () =>
      foldToastDemoShow(model, {
        variant: 'Error',
        payload: {
          title: 'Failed to save',
          maybeDescription: Option.some('Check your connection and try again.'),
        },
      }),

    ClickedShowStickyToast: () =>
      foldToastDemoShow(model, {
        variant: 'Info',
        payload: {
          title: 'Review pending',
          maybeDescription: Option.some('Action required. This stays until dismissed.'),
        },
        sticky: true,
      }),

    ClickedDismissAllToasts: () => foldToastDemoDismissAll(model),

    GotTooltipBasicDemoMessage: ({ message }) => foldTooltipBasicDemo(model, message),

    GotTooltipNoDelayDemoMessage: ({ message }) => foldTooltipNoDelayDemo(model, message),

    GotHoverIntentDemoMessage: ({ message }) => foldHoverIntentDemo(model, message),

    GotAnimationDemoMessage: ({ message }) => foldAnimationDemo(model, message),

    ToggledAnimationDemo: () =>
      model.animationDemo.isShowing ? foldAnimationDemoHide(model) : foldAnimationDemoShow(model),

    GotVirtualListDemoMessage: ({ message }) => foldVirtualListDemo(model, message),

    ClickedVirtualListScrollToMiddle: () =>
      foldVirtualListDemoScrollToIndex(model, Math.floor(VIRTUAL_LIST_ROW_COUNT / 2)),

    GotVirtualListVariableDemoMessage: ({ message }) => foldVirtualListVariableDemo(model, message),

    ClickedVirtualListVariableScrollToMiddle: () =>
      foldVirtualListVariableDemoScrollToIndex(model, Math.floor(VIRTUAL_LIST_ROW_COUNT / 2)),
  })

export const openMobileMenu = (model: UiModel) => foldMobileMenuDialogOpen(model)

export const closeMobileMenu = (model: UiModel) => foldMobileMenuDialogClose(model)
