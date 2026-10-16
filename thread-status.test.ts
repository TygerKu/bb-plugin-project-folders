import { expect, it } from "vitest";
import { threadStatus } from "./thread-status";

it("prioritizes failure and input requests over work and unread activity", () => {
  const idle = { indicator: "none" as const, hasPendingInteraction: false, isUnread: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 } };
  expect(threadStatus(idle)).toBe("inactive");
  expect(threadStatus({ ...idle, isUnread: true })).toBe("unread");
  expect(threadStatus({ ...idle, indicator: "runtime", isUnread: true })).toBe("working");
  expect(threadStatus({ ...idle, activity: { ...idle.activity, backgroundCommands: 1 } })).toBe("working");
  expect(threadStatus({ ...idle, indicator: "runtime", hasPendingInteraction: true })).toBe("waiting");
  expect(threadStatus({ ...idle, indicator: "unread-error", hasPendingInteraction: true })).toBe("failed");
});
