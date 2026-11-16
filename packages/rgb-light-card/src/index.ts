import { defineOnce, logVersion, registerCard } from "@joeladam518/shared-cards/register.ts";

import { RgbLightCardElement } from "./card.tsx";

defineOnce("rgb-light-card", RgbLightCardElement);

registerCard({
  type: "rgb-light-card",
  name: "RGB Light",
  description: "Color wheel, brightness, favorite colors, effects and extra switches for a color light.",
  preview: true,
});

logVersion("RGB-LIGHT-CARD", __VERSION__, "#e040fb");
