# AppFlowy Kanban reference

Reference repo:
- `https://github.com/appflowy-io/appflowy`
- Local reference clone inspected at `/tmp/appflowy-ref`
- Commit inspected: `4af02cdc87468be10ab15dbb4afd27fbf53ce89b`

## Where the board lives

AppFlowy models Kanban as a database board view, not as a separate task-only module.

Key paths:
- `frontend/appflowy_flutter/lib/plugins/database/board/board.dart`
- `frontend/appflowy_flutter/lib/plugins/database/board/application/board_bloc.dart`
- `frontend/appflowy_flutter/lib/plugins/database/board/application/group_controller.dart`
- `frontend/appflowy_flutter/lib/plugins/database/board/presentation/board_page.dart`
- `frontend/appflowy_flutter/lib/plugins/database/board/presentation/widgets/board_focus_scope.dart`
- `frontend/appflowy_flutter/lib/plugins/database/board/presentation/widgets/board_shortcut_container.dart`
- `frontend/appflowy_flutter/lib/plugins/database/board/presentation/widgets/board_column_header.dart`
- `frontend/appflowy_flutter/lib/plugins/database/board/presentation/widgets/board_hidden_groups.dart`

The plugin declares:
- `PluginType.board`
- `ViewLayoutPB.Board`

That means the board is one layout over database rows. Columns are groups from a grouping field, and cards are rows.

## Architecture pattern

The board is split into clear layers:

1. Board plugin and page
   - Owns the board surface and layout.
   - Wires `AppFlowyBoardController` to backend/database actions.

2. BoardBloc
   - Owns board state.
   - Keeps `groupControllers` in a `LinkedHashMap` so group order is stable.
   - Bridges UI events to `DatabaseController`.

3. GroupController
   - Owns rows for one group/column.
   - Listens for `DatabaseNotification.DidUpdateGroupRow`.
   - Applies deleted, inserted, and updated rows locally.

4. RowCard
   - Renders one database row.
   - Handles tap, shift tap, inline edit, hover, focus, and detail opening.

This split is important for UX. Dragging, editing, focus, realtime updates, and detail opening do not fight each other inside one component.

## Drag and drop behavior

Desktop board creates an `AppFlowyBoardController` with these callbacks:

- `onMoveGroup`
  - Calls `databaseController.moveGroup(...)`.

- `onMoveGroupItem`
  - Reads `fromRow` and `toRow` from the current `GroupController`.
  - Calls `databaseController.moveGroupRow(...)` inside the same group.

- `onMoveGroupItemToGroup`
  - Reads `fromRow` from source group and `toRow` from target group.
  - Calls `databaseController.moveGroupRow(...)` across groups.

- `onStartDraggingCard`
  - Clears board focus before dragging.

The key UX detail: when a card starts inline editing, group dragging is disabled. When editing ends, dragging is enabled again.

This avoids the classic board glitch where hover, text selection, card click, and drag all compete for the same pointer events.

## Card identity

Each card is keyed with both column id and card id:

`ValueKey("board_card_${column.id}_${columnItem.id}")`

This is a useful pattern for our SolidJS board too. Card identity should remain stable across renders, and moves between columns should be explicit instead of relying only on array index.

## Visual UX

AppFlowy keeps the board compact and stable:

- Column width:
  - Compact: `196`
  - Normal: `256`
- Card border radius: `6`
- Card margin: horizontal `4`, vertical `3`
- Column/group margin: horizontal `4`
- Group body padding: horizontal `4`
- Group header padding: horizontal `8`
- `stretchGroupHeight: false`

Card decoration is intentionally subtle:

- Surface background.
- One stable border.
- Focus state changes border color to primary.
- Shadow is tiny and stable:
  - blur radius `4`
  - very low alpha
  - second shadow uses negative spread
- Hover color is a subtle overlay, not a changing shadow.

For our board, this is directly relevant to the reported flicker. Hover should not keep toggling layout-affecting styles or shadows. Prefer:

- Stable base shadow.
- Hover background/border tint only.
- No changing transform unless drag is active.
- Drag handle should own drag initiation.
- Card click should own detail opening.

## Detail opening

Card click opens detail through an overlay:

- `_openCard(...)`
- `FlowyOverlay.show(...)`
- `RowDetailPage(...)`

This keeps the board context visible behind the detail panel/modal. For our app, the equivalent should be:

- normal click opens detail
- dragging must not fire detail open
- drag handle pointer down must not bubble into card click
- detail modal state should be independent from drag state

## Create-card UX

AppFlowy supports creation from both:

- top/header action
- bottom/footer action

The footer uses `AnimatedSwitcher` to toggle between an add button and a focused text input.

After creating a row:

- the board can scroll to the new card
- desktop can start inline editing
- mobile can open the new row as a page

This makes creation feel immediate without making the column header too heavy.

## Hidden groups

The board has a `HiddenGroupsColumn` leading element. Hidden columns are not destroyed; they are represented in a dedicated hidden-groups UI.

This is useful for us later if we add archived/snoozed/status-hidden columns.

## Keyboard UX

AppFlowy has a board-level focus scope and shortcuts:

- Arrow up/down: move focus between cards.
- Shift + Arrow: extend selection range.
- Escape: clear focus.
- Delete/Backspace: remove focused card after confirmation.
- Enter: open card detail.
- Shift + Enter: create row after focused card.
- Shift + Cmd/Ctrl + ArrowUp: create row before focused card.
- Comma/Period: move card to adjacent group.
- E: edit focused row.
- N: create a row at bottom of focused group.

The shortcut layer intentionally stops propagation inside editing/text contexts.

## Takeaways for our Kanban

Recommended adaptation order:

1. Separate pointer intents.
   - Drag starts only from the handle.
   - Card body click opens detail.
   - Dragging suppresses click.

2. Stabilize visual states.
   - Keep shadow constant.
   - Use border/background for hover/focus.
   - Do not animate dimensions or expensive shadows on hover.

3. Stabilize card identity.
   - Key cards by story id.
   - Avoid remounting cards during realtime refreshes unless the id changed.

4. Split state responsibilities.
   - Board state: selected project/filter/current columns.
   - Column state: ordered card ids.
   - Card state: display/edit/drag handle interactions.
   - Detail state: selected story id and modal open state.

5. Make realtime updates patch the board, not rebuild the whole board.
   - Apply inserted/updated/deleted stories into existing column arrays.
   - Preserve card component identity during updates.

6. Add board keyboard basics after pointer issues are solved.
   - Escape clear selection/close detail.
   - Enter open focused card.
   - Arrow navigation.

## What not to copy directly

AppFlowy is Flutter and uses `appflowy_board`, BLoC, protobuf, and its database backend. We should not copy code directly.

The useful part is the architecture and interaction contract:

- database-row board model
- stable card identity
- separate drag/edit/open intents
- subtle stable visuals
- controller-based group moves
- overlay detail view
- per-group realtime patching
