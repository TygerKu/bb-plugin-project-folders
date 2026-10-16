// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { defaultPrefs } from "./preferences";
import { installTestMatchMedia } from "./test-match-media";
const state = vi.hoisted(() => ({ display: "classic" }));
vi.mock("./prefs-store", () => ({ usePrefs: () => ({
  prefs: { ...defaultPrefs, chatList: { ...defaultPrefs.chatList, threadDisplay: state.display } },
  items: {}, loaded: true, savePrefs: vi.fn(), saveItem: vi.fn(),
}) }));
afterEach(cleanup);
it("keeps classic rows by default and shows provider/status when enabled in EN and RU", async () => {
  installTestMatchMedia();
  const app = await loadPluginApp(() => import("./app"));
  const thread: PluginSidebarThread = {
    id: "t1",
    projectId: "p1",
    title: "Unread chat",
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: true,
    isPinned: false,
    isArchived: false,
    environment: {
      id: "e1",
      name: null,
      branchName: null,
      providerId: null,
      workspaceDisplayKind: null,
    },
    host: { id: "h1", name: "Mini" },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastReadAt: Date.now(),
    latestAttentionAt: Date.now(),
  };

  const root = { id: "p1", projectId: "p1", hostId: "h1", parentId: null, path: "/work", name: "Project" };
  const mount = () => renderSlot(app.threadLists[0]!, { activeThreadId: null, onNavigate() {} }, {
    sidebarThreads: { threads: [thread], projects: [] },
    rpc: { list: () => ({ roots: [root], folders: [], bindings: {}, errors: [], machines: [{ id: "h1", name: "Mini", connected: true }] }) },
  });
  let view = mount();
  await view.findByText("Unread chat");
  expect(view.baseElement.querySelector(".pf-provider")).toBeNull();
  expect(view.baseElement.querySelector(".pf-thread-state")).toBeNull();
  view.lifecycle.unmount();
  state.display = "provider-status";
  view = mount();
  await view.findByText("Unread chat");
  expect(view.baseElement.querySelector('[data-provider-id="codex"][aria-label="codex"]')).toBeTruthy();
  expect(view.baseElement.querySelector(".pf-thread-state")?.textContent).toBe("Unread");
  view.lifecycle.unmount();
  document.documentElement.lang = "ru";
  view = mount();
  await view.findByText("Unread chat");
  expect(view.baseElement.querySelector(".pf-thread-state")?.textContent).toBe("Непрочитано");
  view.lifecycle.unmount();
  document.documentElement.lang = "en";
});
