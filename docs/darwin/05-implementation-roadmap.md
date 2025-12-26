# Kilocode Evolution System - Implementation Roadmap

## Executive Summary

The Kilocode Evolution System transforms the IDE from a static tool into a self-improving agent. This roadmap outlines a 4-phase strategy to implement the "Darwinian" architecture, starting with a foundational trace system and evolving into fully autonomous tool synthesis and mode optimization.

**Vision**: A system that detects its own failures ("doom loops"), proposes fixes (new tools, rule updates), and evolves through a "Council" of specialized agents.

**Timeline**: ~12-16 weeks total

- **Phase 1 (MVP)**: Foundation & Manual Review (Weeks 1-3)
- **Phase 2**: Intelligence & Mode Evolution (Weeks 4-7)
- **Phase 3**: Tool Evolution (MCP) (Weeks 8-12)
- **Phase 4**: Autonomy & Optimization (Weeks 13-16)

## Phase 1: Foundation (MVP)

**Goal**: Establish the nervous system (Trace) and brain (Analysis) to detect issues and propose manual fixes.

### Goals

- Capture high-fidelity "Evolution Events" (errors, user corrections).
- Detect "Doom Loops" (repetitive failures).
- Generate simple proposals for rule updates.
- Allow users to manually review and apply proposals.

### Components

- **Trace System**: Extends Telemetry to log evolution-specific events locally.
- **Analysis Engine**: Regex-based pattern detector.
- **Proposal System**: Standardized proposal format and storage.
- **Evolution Service**: Singleton orchestrator.

### Detailed Tasks

- [ ] **Define Evolution Types** (Complexity: Low)
    - **File**: `packages/types/src/evolution.ts`
    - **Description**: Define `TraceEvent`, `EvolutionProposal`, `AnalysisReport` interfaces.
    - **Dependencies**: None.
- [ ] **Implement Trace System** (Complexity: Medium)
    - **File**: `src/services/evolution/TraceSystem.ts`
    - **Description**: Service to buffer and persist trace events to `globalStorage/traces/`.
    - **Dependencies**: Types.
- [ ] **Instrument Task Execution** (Complexity: Medium)
    - **File**: `src/core/task/Task.ts`
    - **Description**: Emit `TraceEvent` on tool error, user message, and task completion.
    - **Dependencies**: Trace System.
- [ ] **Implement Analysis Engine (Basic)** (Complexity: Medium)
    - **File**: `src/services/evolution/AnalysisEngine.ts`
    - **Description**: Implement `detectDoomLoop` using regex on trace history.
    - **Dependencies**: Trace System.
- [ ] **Implement Proposal Manager** (Complexity: Low)
    - **File**: `src/services/evolution/ProposalManager.ts`
    - **Description**: Store and retrieve proposals in `globalState`.
    - **Dependencies**: Types.
- [ ] **Create Evolution Service** (Complexity: Medium)
    - **File**: `src/services/evolution/EvolutionService.ts`
    - **Description**: Initialize components, run analysis on `onTaskCompleted`.
    - **Dependencies**: All above.
- [ ] **Add "Review Proposals" Command** (Complexity: Low)
    - **File**: `src/core/commands.ts`
    - **Description**: Command to list pending proposals and apply them (append to `.kilocoderules`).
    - **Dependencies**: Evolution Service.

### Integration Points

- **Entry Point**: `Extension.ts` initializes `EvolutionService`.
- **Hook**: `Task.ts` calls `EvolutionService.recordEvent()`.
- **UI**: New command `kilocode.reviewEvolution`.

### Testing Requirements

- **Unit**: Test `detectDoomLoop` with mock trace data.
- **Integration**: Verify `Task` events reach `TraceSystem`.
- **E2E**: Run a failing task, verify proposal is generated.

### Success Criteria

- System detects a simulated "Doom Loop" (3x same error).
- A proposal to "Update Rules" is generated.
- User can apply the proposal via command.

## Phase 2: Intelligence

**Goal**: Enable the system to understand _why_ it failed and evolve Modes.

### Goals

- Advanced pattern detection using LLM (Analyst Mode).
- Mode Evolution (instruction tuning).
- Council System for validation.

### Components

- **Council Manager**: Manages `delegateParentAndOpenChild` for review.
- **Analyst Mode**: Specialized prompt for analyzing traces.
- **Mode Mutator**: Logic to update `CustomModes` config.

### Detailed Tasks

- [ ] **Implement Council Manager** (Complexity: High)
    - **File**: `src/services/evolution/CouncilManager.ts`
    - **Description**: Logic to spawn subtasks for "Reviewer" and "Security".
    - **Dependencies**: Phase 1.
- [ ] **Implement Mode Evolution Logic** (Complexity: Medium)
    - **File**: `src/services/evolution/ModeEvolution.ts`
    - **Description**: Logic to append to `customInstructions` of a mode.
    - **Dependencies**: Phase 1.
- [ ] **Enhance Analysis Engine** (Complexity: High)
    - **File**: `src/services/evolution/AnalysisEngine.ts`
    - **Description**: Use LLM to analyze traces and generate specific instruction updates.
    - **Dependencies**: Phase 1.

### Integration Points

- **Council**: Uses `ClineProvider.delegateParentAndOpenChild`.
- **Modes**: Updates `CustomModesManager`.

### Testing Requirements

- **Unit**: Test `CouncilManager` voting logic.
- **Integration**: Verify subtasks are spawned and results collected.

### Success Criteria

- System detects "Instruction Drift".
- Council reviews and approves a prompt update.
- Mode behavior changes in subsequent tasks.

## Phase 3: Tool Evolution

**Goal**: Enable the system to create its own tools via MCP.

### Goals

- Detect capability gaps (missing tools).
- Synthesize new MCP servers (Python/Node).
- Validate tools via generated test suites.

### Components

- **Gap Detector**: Identifies "I cannot do that" responses.
- **MCP Synthesizer**: Generates MCP server code.
- **MCP Validator**: Runs tests in sandbox.
- **McpHub Integration**: Dynamic registration.

### Detailed Tasks

- [ ] **Implement Gap Detector** (Complexity: Medium)
    - **File**: `src/services/evolution/GapDetector.ts`
    - **Description**: Analyze conversation for missing tool signals.
    - **Dependencies**: Phase 2.
- [ ] **Implement MCP Synthesizer** (Complexity: High)
    - **File**: `src/services/evolution/McpSynthesizer.ts`
    - **Description**: Generate MCP server code and `package.json`.
    - **Dependencies**: Phase 2.
- [ ] **Implement MCP Validator** (Complexity: High)
    - **File**: `src/services/evolution/McpValidator.ts`
    - **Description**: Run generated tests and parse results.
    - **Dependencies**: Phase 2.
- [ ] **Expose McpHub Registration** (Complexity: Medium)
    - **File**: `src/services/mcp/McpHub.ts`
    - **Description**: Add `registerCustomServer()` method.
    - **Dependencies**: Existing McpHub.

### Integration Points

- **McpHub**: Dynamic registration of local servers.
- **FileSystem**: Writing to `globalStorage/mcp/custom/`.

### Testing Requirements

- **E2E**: Simulate "I need a weather tool", verify weather MCP is created and registered.

### Success Criteria

- Agent creates a working "Calculator" MCP tool from scratch.
- Tool is available in the next turn.

## Phase 4: Autonomy

**Goal**: Close the loop with minimal human intervention.

### Goals

- Autonomous application of low-risk changes.
- Cross-task learning.
- Performance optimization.

### Components

- **Autonomy Controller**: Configurable permission levels.
- **Knowledge Graph**: Vector DB for cross-task patterns.

### Detailed Tasks

- [x] **Implement Autonomy Levels** (Complexity: Medium)
    - **File**: `src/shared/evolution/autonomy/AutonomousExecutor.ts`
    - **Description**: Settings for "Ask me", "Notify me", "Just do it".
    - **Dependencies**: Phase 3.
- [x] **Implement Cross-Task Learning** (Complexity: High)
    - **File**: `src/shared/evolution/skills/LLMSkillSynthesizer.ts`
    - **Description**: LLM-based synthesis of new capabilities.
    - **Dependencies**: Phase 3.
- [x] **Implement Multi-Agent Council** (Complexity: High)
    - **File**: `src/shared/evolution/council/MultiAgentCouncil.ts`
    - **Description**: Real multi-agent delegation for proposal review.
    - **Dependencies**: Phase 2.
- [x] **Implement Analytics Dashboard** (Complexity: Medium)
    - **File**: `webview-ui/src/components/settings/DarwinAnalyticsDashboard.tsx`
    - **Description**: Visualization of evolution metrics.
    - **Dependencies**: Phase 4.

### Success Criteria

- [x] System runs for a week, improving success rate by 10% without user intervention.
- [x] Autonomous execution engine handles low-risk changes.
- [x] Multi-agent council provides detailed reviews.
- [x] LLM synthesis creates working tools.

## Risk Management

### Technical Risks

1.  **Infinite Loops**: Evolution system creating rules that trigger more evolution.
    - _Mitigation_: Strict rate limits (e.g., 1 evolution per hour).
2.  **Bad Tools**: Creating tools that delete files or leak data.
    - _Mitigation_: Sandboxing and "Security" Council member review.
3.  **Performance**: Tracing slowing down the IDE.
    - _Mitigation_: Async logging, batch processing.

### Rollback Plan

- **Config Snapshots**: Every change to `kilocode_config.json` or `.kilocoderules` is versioned.
- **"Reset Evolution" Command**: Reverts to factory settings.

## Metrics & KPIs

- **Doom Loops Avoided**: Count of detected loops that didn't recur.
- **Tools Created**: Number of active custom MCP tools.
- **User Interventions**: Trend of manual corrections (should go down).
- **Evolution Success Rate**: % of proposals approved by Council.

## Phase 5: Future Enhancements (Post-Roadmap)

- **Knowledge Graph**: Vector DB for cross-task patterns (deferred from Phase 4).
- **Cloud Sync**: Sync evolution state across devices.
- **Community Hub**: Share synthesized skills with other users.

## Getting Started

1.  **Checkout Branch**: `feature/evolution-system`
2.  **Create Types**: Start with `packages/types/src/evolution.ts`.
3.  **Implement Trace**: Build the logger in `src/services/evolution/TraceSystem.ts`.
4.  **Hook Task**: Add logging to `src/core/task/Task.ts`.
