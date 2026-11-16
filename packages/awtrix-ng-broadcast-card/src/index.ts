import { defineOnce, logVersion, registerCard } from "@joeladam518/shared-cards/register.ts";

import { AwtrixNgBroadcastCard } from "./broadcast-card.ts";

defineOnce("awtrix-ng-broadcast-card", AwtrixNgBroadcastCard);

registerCard({
  type: "awtrix-ng-broadcast-card",
  name: "AWTRIX NG – Message all clocks",
  description: "Send one message to several AWTRIX NG clocks at once.",
  preview: false,
});

logVersion("AWTRIX-NG-BROADCAST-CARD", __VERSION__, "#f5a568");
