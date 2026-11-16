import { defineOnce, logVersion, registerCard } from "@joeladam518/shared-cards/register.ts";

import { AwtrixNgAlarmCardElement } from "./alarm-card.tsx";

defineOnce("awtrix-ng-alarm-card", AwtrixNgAlarmCardElement);

registerCard({
  type: "awtrix-ng-alarm-card",
  name: "AWTRIX NG – Alarm clock",
  description: "Add, edit and remove alarm times (with days) and pick the alarm sound.",
  preview: false,
});

logVersion("AWTRIX-NG-ALARM-CARD", __VERSION__, "#f5a568");
