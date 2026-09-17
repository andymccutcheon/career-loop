# Schedule (v0)

Career Loop registers a macOS launchd job **from the app**. You never copy a plist.

## Paths (required)

| Item | Location |
|------|----------|
| WorkingDirectory | `~/Library/Application Support/CareerLoop` |
| Plist file | `~/Library/Application Support/CareerLoop/com.careerloop.daily.plist` |
| Runner | `~/Library/Application Support/CareerLoop/bin/career-loop-runner` |
| Logs | `~/Library/Logs/CareerLoop/` |

**Never** Documents, Desktop, or iCloud (TCC killed that pattern on 2026-09-12).

## Behavior

- Calendar: **08:30 local** (America/Boise for Andy’s Mac).
- `RunAtLoad=true` for **catch-up-on-wake**: if the laptop slept through the window, the next load runs once.
- `state/last_success_at` day stamp prevents duplicate spam the same calendar day.
- Empty days still produce a digest + OS notification.

## API

```js
import { registerDailySchedule, describeScheduleContract } from '@career-loop/core/schedule';
registerDailySchedule(); // writes plist + bootstraps on macOS
```
