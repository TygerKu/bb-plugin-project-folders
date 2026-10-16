import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export const statusLabels = {
  failed: "Сбой",
  waiting: "Нужно ваше внимание",
  working: "Работает",
  unread: "Непрочитано",
  inactive: "Неактивен",
} as const;

/** Match BB's explicit attention indicators before broader runtime activity. */
export function threadStatus(thread: Pick<PluginSidebarThread,
  "indicator" | "hasPendingInteraction" | "isUnread" | "activity"
>): keyof typeof statusLabels {
  if (thread.indicator === "unread-error") return "failed";
  if (thread.indicator === "waiting-for-input" || thread.hasPendingInteraction)
    return "waiting";
  if (["runtime", "workflow", "background-agent", "background-command", "plan-mode", "goal"].includes(thread.indicator)
    || Object.values(thread.activity).some((count) => count > 0))
    return "working";
  return thread.indicator === "unread-success" || thread.isUnread ? "unread" : "inactive";
}
