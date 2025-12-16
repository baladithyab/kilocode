---
"kilo-code": minor
---

Add Evolution Layer automation capabilities with configurable trigger conditions and safety controls

**New Features:**

- Added `evolution.automation.level` setting (0-3) to control automation level:

    - Level 0: Manual (default) - No automation, all actions require manual initiation
    - Level 1: Auto-Trigger - Automatic trace export and council review on failure/cost thresholds
    - Level 2: Auto-Apply Low-Risk - Automatic application of low-risk proposals (mode-map, docs)
    - Level 3: Full Closed-Loop - Complete automation with all configured proposal types

- Added configurable trigger conditions:

    - `evolution.automation.triggers.failureRate` (default: 0.3) - Failure rate threshold
    - `evolution.automation.triggers.costThreshold` (default: 100) - Cost threshold in tokens
    - `evolution.automation.triggers.cooldown` (default: 3600) - Cooldown between runs in seconds

- Added safety controls:
    - `evolution.automation.safety.maxDailyRuns` (default: 5) - Maximum automation runs per day
    - `evolution.automation.safety.autoApplyTypes` (default: ["mode-map", "docs"]) - Proposal types eligible for auto-apply

**Safety Boundaries:**

- Files matching sensitive patterns (rules.md, council.yaml, package.json, .github/) always require human approval
- Rate limiting prevents runaway automation with daily limits and cooldown periods
- All automated actions are logged to the Evolution Output Channel for auditability
- Notifications are shown for important automated actions

**Technical Details:**

- New `src/shared/evolution/automation.ts` module with:
    - Trigger condition evaluation (failure rate, cost threshold)
    - Rate limiting and cooldown logic
    - Safety checks for auto-apply categories
    - Category inference from file paths
- Integration with task completion events in `src/activate/commands/evolution.ts`
- Comprehensive test coverage in `src/shared/evolution/automation.spec.ts` (43 tests)
