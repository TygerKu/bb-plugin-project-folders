// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { defaultPrefs, parsePrefs } from "./preferences";
import { t } from "./i18n";

afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.lang = "en"; });
it("uses BB's language by default, with explicit plugin language taking precedence", () => {
  document.documentElement.lang = "ru-RU";
  expect(t("Работает")).toBe("Работает");
  document.documentElement.lang = "en";
  expect(t("Работает")).toBe("Working");
  localStorage.setItem("project-folders:language", "ru");
  expect(t("Работает")).toBe("Работает");
});
it("keeps provider/status opt-in, validates saved values and preserves it on import", () => {
  expect(parsePrefs({}).chatList.threadDisplay).toBe("classic");
  expect(parsePrefs({ chatList: { threadDisplay: "bad" } }).chatList.threadDisplay).toBe("classic");
  expect(parsePrefs({ chatList: { threadDisplay: "provider-status" } }).chatList.threadDisplay).toBe("provider-status");
});
