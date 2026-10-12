# Section context menu: trim to essentials + "Mark all as read"

Both changes live in the section/group/project-root row context menu in app.tsx (the DropdownMenuContent with "Новый раздел" / "Новая группа" / "Настройка", ~line 2055) plus translations.ts / locales/*.

## 1. "Mark all as read" (new)
- New item at the top of the section/group/project-root row menu: EN key "Mark all as read", RU «Прочитать всё». Icon CheckCheck (or Check).
- Shown only when the row has unread chats: reuse hasFolderUnread(...) (already computed as folderUnread for the bold label, ~line 2508). Hidden otherwise.
- Scope = whole subtree under the row:
  - section/group: collectFolderThreads(folderId, projectId, folders, bindings, threads, places) (already walks child sections via collectSubtreeFolderIds);
  - project root: every non-archived thread of that project (same rule as the root branch of hasFolderUnread).
- Action: for every non-archived thread with isUnread, call the existing per-thread a.setRead(thread.id, true) (same API as the chat row menu «Отметить прочитанным», ~line 1866). Run in parallel with Promise.allSettled; one failure does not stop the rest.
- Threads with a pending interaction (question or approval waiting) are NOT touched — marking read must not hide a question waiting for the owner. Only isUnread is cleared.
- Extract the selection (which threads get marked) into a pure, unit-tested helper (e.g. in chat-list.ts).
- Add the same item to the Panel «Действия» menu for the selected row (~line 3440).

## 2. Trim the row context menu
Target menu (section / group):
```
Прочитать всё          (only when unread)
Новый раздел
Новая группа
───────────
Переименовать
Скрыть из дерева
Сортировка ›           (one submenu: chat sorting + section sorting as two labelled groups)
Настройка…
───────────
Удалить / Удалить группу
```
- Project root keeps «Новый проект» and «Перенести» as today.
- Remove from the row context menu only: «Оформление», «Правила работы», «Изменить путь», «Переместить в группу…» (drag-and-drop also moves). They stay in the Panel «Действия» menu — do NOT remove anything from that menu.
- Merge ChatSortMenu + SectionSortMenu into one «Сортировка ›» submenu with two labelled groups.

## 3. Release metadata
- package.json (and package-lock.json top-level version fields): 0.6.36 -> 0.6.37.
- CHANGELOG.md: new top section "## 0.6.37 — Mark all as read and a shorter section menu" with two bullets describing the new item (subtree, skips chats waiting for a question/approval) and the trimmed menu (rare actions moved to the Actions menu, one Sorting submenu).

## Strings
New UI strings: English keys first in translations.ts, Russian values, all locales/*.json updated like other keys.

## Verification
npx tsc --noEmit -p . ; npx vitest run chat-list.test.ts chat-actions.test.tsx i18n.test.ts panel.test.tsx ; npm run build.

## Completion
- [x] Section menu changes accepted in `lprun_392be29584b64e85bb8ab8031b9ff909` (commit: `0cab65c`).
