import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`Missing colour token: ${name}`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const WCAG_AA = 4.5;
const BACKGROUNDS = ["background", "card", "secondary"];

describe("theme text contrast (WCAG AA)", () => {
  it.each(BACKGROUNDS)("main and secondary text pass on %s", (background) => {
    expect(contrast(token("foreground"), token(background))).toBeGreaterThanOrEqual(WCAG_AA);
    expect(contrast(token("muted-foreground"), token(background))).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it.each(BACKGROUNDS)("crimson text and error text pass on %s", (background) => {
    expect(contrast(token("color-crimson-400"), token(background))).toBeGreaterThanOrEqual(WCAG_AA);
    expect(contrast(token("destructive"), token(background))).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("button text passes on crimson", () => {
    expect(contrast(token("primary-foreground"), token("primary"))).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("the active desktop nav item and preview banner pass", () => {
    expect(contrast(token("color-bone-50"), token("color-crimson-950"))).toBeGreaterThanOrEqual(WCAG_AA);
    expect(contrast(token("color-ember-100"), token("color-ember-950"))).toBeGreaterThanOrEqual(WCAG_AA);
  });
});
