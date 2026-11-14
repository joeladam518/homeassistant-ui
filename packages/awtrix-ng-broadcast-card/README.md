# AWTRIX NG "Message all clocks" card

One message box that sends to several AWTRIX NG clocks at once. `type: custom:awtrix-ng-broadcast-card`

- A chip for each clock picks which ones get the message. Offline clocks are crossed out (live status needs an admin user).
- Colour or rainbow text, an icon, how long it shows, a chime, **Dismiss all**, and your last 6 messages.
- It remembers your clock picks and message style, per browser.

```yaml
type: custom:awtrix-ng-broadcast-card
title: Message all clocks # optional
clocks: # optional: leave out to use every clock found
  - prefix: awtrix_clock_1
    name: Livingroom
  - prefix: awtrix_clock_2
    name: Office
  - prefix: awtrix3
    name: Bedroom
```

Without `clocks`, it uses every clock that has an "MQTT prefix" sensor (from AWTRIX HA discovery).

In a Sections dashboard, set the section to span the full width so the card sits across the top.
