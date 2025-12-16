---
"kilo-code": minor
---

## Evolution Layer: Complete Core Features

Implements remaining Evolution Layer features for automatic mode detection, Policy Engine, and self-healing capabilities.

### Mode Detection (`src/shared/evolution/modeDetection.ts`)

- Scans `.kilocodemodes` file for mode definitions
- Compares with modes tracked in `.kilocode/evolution/council.yaml`
- Identifies untracked modes and orphaned council roles
- Generates nudge messages for detected drift
- Evaluates automation triggers based on configurable thresholds

### Policy Engine (`src/shared/evolution/policyEngine.ts`)

- Dynamically routes tasks to optimal modes based on:
    - Task description patterns (regex matching)
    - Cost constraints and estimates
    - File extensions being modified
    - Task complexity scores
    - Historical performance metrics
- Includes built-in rules for:
    - Architecture tasks → Architect mode
    - Debugging/error tasks → Debug mode
    - Test writing tasks → Test mode
    - Documentation tasks → Docs mode
- Supports rule evolution through feedback recording
- Extensible condition system with multiple operators

### Self-Healing (`src/shared/evolution/selfHealing.ts`)

- Tracks proposal applications with before/after metrics
- Automatically backs up files before changes
- Detects performance degradation based on:
    - Success rate drops
    - Cost increases
    - Duration increases
- Recommends and performs rollbacks when degradation detected
- Rate limiting prevents excessive automated rollbacks (default: 3/day)
- Maintains audit trail of all rollback actions

### Initialization

- `initializeEvolutionAutomation()` now called during extension activation
- Evolution Layer components properly initialized in `registerCommands`
- Initialization logged to Evolution Output Channel

### Tests

- Comprehensive unit tests for all modules (112 tests)
- Integration tests verifying full cycle:
    - Mode detection → automation trigger
    - Policy Engine → task routing
    - Self-healing → rollback mechanism
