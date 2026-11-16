import { defineOnce, logVersion, registerCard } from "@joeladam518/shared-cards/register.ts";

import { AwtrixNgBroadcastCardElement } from "./broadcast-card.tsx";

defineOnce("awtrix-ng-broadcast-card", AwtrixNgBroadcastCardElement);

registerCard({
  type: "awtrix-ng-broadcast-card",
  name: "AWTRIX NG – Message all clocks",
  description: "Send one message to several AWTRIX NG clocks at once.",
  preview: false,
});

logVersion("AWTRIX-NG-BROADCAST-CARD", __VERSION__, "#f5a568");
