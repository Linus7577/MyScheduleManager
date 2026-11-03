import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import zhTW from "../../messages/zh-TW.json";

function flatten(messages: object, prefix = ""): Record<string, string> {
  return Object.entries(messages).reduce<Record<string, string>>((all, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? { ...all, [path]: value } : { ...all, ...flatten(value, path) };
  }, {});
}

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

describe("translations", () => {
  const english = flatten(en);
  const chinese = flatten(zhTW);

  it("have exactly the same keys in both languages", () => {
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort());
  });

  it("have no empty strings", () => {
    expect(Object.values(english).filter((text) => !text.trim())).toEqual([]);
    expect(Object.values(chinese).filter((text) => !text.trim())).toEqual([]);
  });

  it("use the same placeholders in both languages", () => {
    for (const key of Object.keys(english)) {
      expect(placeholders(chinese[key] ?? ""), key).toEqual(placeholders(english[key]));
    }
  });
});
