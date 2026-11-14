import { defineOnce, logVersion, registerCard } from "@homeassistant-ui/shared/lib/register.ts";

import { AwtrixNgAlarmCard } from "./alarm-card.ts";

defineOnce("awtrix-ng-alarm-card", AwtrixNgAlarmCard);

registerCard({
  type: "awtrix-ng-alarm-card",
  name: "AWTRIX NG – Alarm clock",
  description: "Add, edit and remove alarm times (with days) and pick the alarm sound.",
  preview: false,
});

logVersion("AWTRIX-NG-ALARM-CARD", __VERSION__, "#f5a568");
