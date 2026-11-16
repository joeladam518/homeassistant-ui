import { describe, expect, it } from "vitest";

// Runs against the built files (npm run build first), the same files Home Assistant loads.
describe("dist bundles", () => {
  it("awtrix-ng-alarm-card.js defines the alarm card", async () => {
    // @ts-expect-error -- the built file has no type declarations
    await import("../dist/awtrix-ng-alarm-card.js");
    expect(customElements.get("awtrix-ng-alarm-card")).toBeDefined();
  });

  it("awtrix-ng-broadcast-card.js defines the broadcast card", async () => {
    // @ts-expect-error -- the built file has no type declarations
    await import("../dist/awtrix-ng-broadcast-card.js");
    expect(customElements.get("awtrix-ng-broadcast-card")).toBeDefined();
  });

  it("rgb-light-card.js defines the RGB light card", async () => {
    // @ts-expect-error -- the built file has no type declarations
    await import("../dist/rgb-light-card.js");
    expect(customElements.get("rgb-light-card")).toBeDefined();
    expect(window.customCards?.map((c) => c.type)).toContain("rgb-light-card");
  });
});
