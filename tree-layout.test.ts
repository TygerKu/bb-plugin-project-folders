import { expect, it } from "vitest";
import {
  sidebarTreeLayout,
  TREE_ROW_PADDING,
  TREE_CONTENT_PADDING,
  TREE_CHEVRON_WIDTH,
  TREE_LABEL_GAP,
} from "./tree-layout";

it("keeps guides under parent chevrons and chats one complete level deeper at every depth", () => {
  for (const indent of [0, 4, 8, 16, 32]) {
    const layout = sidebarTreeLayout(indent);
    for (let depth = 0; depth <= 5; depth++) {
      const parent = depth * layout.childStep;
      const chevron = parent + TREE_ROW_PADDING + TREE_CONTENT_PADDING;
      const parentIcon = chevron + TREE_CHEVRON_WIDTH + TREE_LABEL_GAP;
      const childContent = parent + layout.childStep;
      const chatRow = childContent + layout.chatOffset;
      const chatMarker = chatRow + TREE_ROW_PADDING + TREE_CONTENT_PADDING;
      const childFolderIcon =
        childContent +
        TREE_ROW_PADDING +
        TREE_CONTENT_PADDING +
        TREE_CHEVRON_WIDTH +
        TREE_LABEL_GAP;
      const showAllIcon = chatRow + TREE_ROW_PADDING + TREE_CONTENT_PADDING;
      expect(parent + layout.guideOffset).toBe(
        chevron + TREE_CHEVRON_WIDTH / 2,
      );
      expect(chatMarker).toBe(parentIcon + layout.childStep);
      expect(chatMarker).toBe(childFolderIcon);
      expect(showAllIcon).toBe(chatMarker);
      expect(chatRow).toBeGreaterThan(parentIcon);
    }
  }
});

it("retains the chevron column even at zero indent and bounds invalid settings", () => {
  expect(sidebarTreeLayout(0)).toEqual({
    guideOffset: 12,
    childPadding: 0,
    chatOffset: 19,
    childStep: 13,
  });
  expect(sidebarTreeLayout(4).childStep).toBe(17);
  expect(sidebarTreeLayout(-10).childPadding).toBe(0);
  expect(sidebarTreeLayout(100).childPadding).toBe(32);
  expect(sidebarTreeLayout(NaN).childPadding).toBe(8);
});
