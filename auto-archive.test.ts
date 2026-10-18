import { describe, it, expect, vi } from "vitest";
import {
  createAutoArchive,
  defaultAutoArchiveConfig,
  isStale,
  parseAutoArchiveConfig,
  type AutoArchiveThread,
} from "./auto-archive";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

const thread = (over: Partial<AutoArchiveThread> = {}): AutoArchiveThread => ({
  id: "t1",
  pinnedAt: null,
  archivedAt: null,
  deletedAt: null,
  parentThreadId: null,
  status: "idle",
  createdAt: NOW - 30 * DAY,
  updatedAt: NOW - 10 * DAY,
  latestAttentionAt: NOW - 10 * DAY,
  hasPendingInteraction: false,
  queuedWork: "none",
  activity: { activeBackgroundAgentCount: 0, activeWorkflowCount: 0 },
  runtime: { displayStatus: "idle" },
  ...over,
});

const on = { enabled: true, days: 7 };

describe("auto-archive configuration", () => {
  it("defaults to off after 7 days", () => {
    expect(defaultAutoArchiveConfig).toEqual({ enabled: false, days: 7 });
  });
  it("keeps valid fields of a damaged config", () => {
    expect(parseAutoArchiveConfig({ enabled: true, days: 0 })).toEqual({
      enabled: true,
      days: 7,
    });
    expect(parseAutoArchiveConfig({ days: 30 })).toEqual({ enabled: false, days: 30 });
    expect(parseAutoArchiveConfig("junk")).toEqual(defaultAutoArchiveConfig);
  });
});

describe("isStale", () => {
  it("archives a quiet chat older than N days", () => {
    expect(isStale(thread(), on, NOW)).toBe(true);
  });
  it("archives an old chat that ended in an error", () => {
    expect(
      isStale(thread({ status: "error", runtime: { displayStatus: "error" } }), on, NOW),
    ).toBe(true);
  });
  it("keeps a chat with recent activity", () => {
    expect(isStale(thread({ updatedAt: NOW - 2 * DAY }), on, NOW)).toBe(false);
    expect(isStale(thread({ latestAttentionAt: NOW - DAY }), on, NOW)).toBe(false);
  });
  it("never touches pinned, nested, busy or waiting chats", () => {
    expect(isStale(thread({ pinnedAt: 1 }), on, NOW)).toBe(false);
    expect(isStale(thread({ parentThreadId: "p" }), on, NOW)).toBe(false);
    expect(isStale(thread({ status: "active" }), on, NOW)).toBe(false);
    expect(isStale(thread({ status: "starting" }), on, NOW)).toBe(false);
    expect(isStale(thread({ runtime: { displayStatus: "active" } }), on, NOW)).toBe(false);
    expect(isStale(thread({ hasPendingInteraction: true }), on, NOW)).toBe(false);
    expect(isStale(thread({ queuedWork: "waiting" }), on, NOW)).toBe(false);
    expect(
      isStale(thread({ activity: { activeWorkflowCount: 1 } }), on, NOW),
    ).toBe(false);
    expect(isStale(thread({ archivedAt: 1 }), on, NOW)).toBe(false);
  });
});

describe("createAutoArchive", () => {
  const setup = (threads: AutoArchiveThread[], config = on) => {
    const archive = vi.fn(async () => ({}));
    const list = vi.fn(async (args?: { offset?: number }) =>
      (args?.offset ?? 0) === 0 ? threads : [],
    );
    const aa = createAutoArchive({
      sdk: { threads: { list, archive } },
      getConfig: () => config,
      now: () => NOW,
      setInterval: () => 0,
      clearInterval: () => {},
    });
    return { aa, archive, list };
  };

  it("does nothing when disabled", async () => {
    const { aa, archive, list } = setup([thread()], { enabled: false, days: 7 });
    await aa.initialPromise;
    expect(await aa.sweep()).toBe(0);
    expect(list).not.toHaveBeenCalled();
    expect(archive).not.toHaveBeenCalled();
  });

  it("archives only stale chats and reports the count", async () => {
    const { aa, archive } = setup([
      thread({ id: "old" }),
      thread({ id: "fresh", updatedAt: NOW - DAY, latestAttentionAt: NOW - DAY }),
      thread({ id: "pinned", pinnedAt: 1 }),
    ]);
    expect(await aa.initialPromise).toBe(1);
    expect(archive).toHaveBeenCalledTimes(1);
    expect(archive).toHaveBeenCalledWith({ threadId: "old" });
  });

  it("stops paging when the host repeats the same rows", async () => {
    const page = Array.from({ length: 200 }, (_, i) => thread({ id: `t${i}` }));
    const archive = vi.fn(async () => ({}));
    const list = vi.fn(async () => page);
    const aa = createAutoArchive({
      sdk: { threads: { list, archive } },
      getConfig: () => on,
      now: () => NOW,
      setInterval: () => 0,
      clearInterval: () => {},
    });
    expect(await aa.initialPromise).toBe(200);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("keeps going when one archive call fails", async () => {
    const { aa, archive } = setup([thread({ id: "a" }), thread({ id: "b" })]);
    archive.mockRejectedValueOnce(new Error("boom"));
    expect(await aa.initialPromise).toBe(1);
    expect(archive).toHaveBeenCalledTimes(2);
  });
});
