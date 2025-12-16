---
"kilo-code": minor
---

Add A/B testing runner for Evolution Layer Level 3 automation

## New Features

### A/B Testing Infrastructure

This release introduces the A/B testing runner for the Evolution Layer, enabling systematic comparison of different mode configurations and approaches for the same task.

#### HeadlessClineProvider (`src/services/evolution/HeadlessClineProvider.ts`)

- Extends ClineProvider for headless (non-interactive) task execution
- Auto-approval configuration for all tool uses during A/B test runs
- Captures task events and traces programmatically
- Handles timeouts and errors gracefully
- Emits progress events for real-time monitoring

#### ABTestService (`src/services/evolution/ABTestService.ts`)

- Main orchestration service implementing Sequential Execution with Checkpoints strategy
- Creates workspace checkpoints before test runs
- Executes variants sequentially with automatic rollback between runs
- Collects comprehensive results including traces, diffs, costs, and success metrics
- Generates comparison reports suitable for LLM Council review
- Supports configurable timeouts per variant

#### A/B Test Schemas (`src/shared/evolution/abTestSchemas.ts`)

- `ABTestConfig`: Configuration for A/B tests (variants, task prompt, timeout)
- `ABTestVariantConfig`: Individual variant configuration (mode, model, instructions)
- `ABTestVariantResult`: Results from a single variant run
- `ABTestComparison`: Comparative metrics between variants
- `ABTestResult`: Complete test results with winner determination
- Helper functions for test ID generation and comparison metrics

### New VS Code Commands

- `kilocode.evolution.runABTest`: Run an A/B test with specified configuration

    - Supports 2-4 variants per test
    - Integrates with checkpoint service for workspace isolation
    - Provides progress notifications during execution

- `kilocode.evolution.reviewABTestResults`: Send A/B test results to Council for review
    - Generates formatted markdown summary
    - Includes comparative analysis and recommendations

### Level 3 Automation Integration

Extended `src/shared/evolution/automation.ts` with A/B testing support:

- `ABTestAutomationConfig`: Settings for automated A/B test triggering
- `ABTestTriggerConditions`: Conditions that trigger automatic A/B tests
- `shouldTriggerABTest()`: Evaluates if conditions warrant A/B testing
- `createABTestConfigFromAutomation()`: Creates test config from automation settings
- `evaluateABTestResult()`: Analyzes results for auto-application eligibility

### Safety Boundaries

A/B tests operate within Evolution Layer safety boundaries:

- All file changes are checkpointed and can be rolled back
- Tests run with configurable timeouts to prevent infinite runs
- External API calls are logged but not prevented
- Results require Council review before application at Level 3

## Test Coverage

Added comprehensive test suites:

- `abTestSchemas.spec.ts`: Schema validation and helper functions
- `abTestAutomation.spec.ts`: Automation integration tests
- `HeadlessClineProvider.spec.ts`: Headless execution behavior
- `ABTestService.spec.ts`: Orchestration and checkpoint workflow tests

103 new tests covering:

- Configuration validation
- Checkpoint creation and restoration
- Sequential variant execution
- Result aggregation and winner determination
- Error handling and timeout management
- Progress event emission
