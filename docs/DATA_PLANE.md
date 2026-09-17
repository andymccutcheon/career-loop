# Data plane

All user digests, logs, and loop state live under OS app-support:

```
~/Library/Application Support/CareerLoop/
  digests/          # HTML + Markdown digests
  state/            # portals.json, loop.json, last_success_at
  bin/              # schedule runner
  logs/             # delivery.log, schedule.log
  com.careerloop.daily.plist
~/Library/Logs/CareerLoop/   # mirrored schedule/delivery logs on macOS
```

Not in git. Not in Documents.
