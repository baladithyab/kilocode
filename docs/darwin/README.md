# Darwin Evolution System Documentation

> **Transform Kilocode from a static development tool into a self-improving AI coding assistant.**

The Darwin Evolution System enables Kilocode to autonomously synthesize new capabilities, optimize its configuration, detect and break failure loops, and evolve its behavior based on project-specific needs.

## 🚀 Quick Start

**New to Darwin?** Start here:

1. 📖 **[Research Summary](./RESEARCH_SUMMARY.md)** - Executive overview of the entire system
2. 🏗️ **[Unified Architecture](./04-unified-architecture.md)** - Complete architecture diagram
3. 🗺️ **[Implementation Roadmap](./05-implementation-roadmap.md)** - Phased development plan

## 📚 Documentation Index

### Core Documentation

| #   | Document                                                       | Description                                                            |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 📊  | [RESEARCH_SUMMARY.md](./RESEARCH_SUMMARY.md)                   | **Start here** - Executive overview, key findings, and quick reference |
| 01  | [01-analysis.md](./01-analysis.md)                             | Initial analysis of Darwin patterns and Kilocode mapping               |
| 02  | [02-architecture.md](./02-architecture.md)                     | Detailed architectural design, schemas, and sequence diagrams          |
| 03  | [03-advanced-capabilities.md](./03-advanced-capabilities.md)   | Skills pattern, configuration evolution, local mode overrides          |
| 04  | [04-unified-architecture.md](./04-unified-architecture.md)     | Unified architecture combining all concepts                            |
| 05  | [05-implementation-roadmap.md](./05-implementation-roadmap.md) | Implementation plan with tasks and success criteria                    |

### Phase 4: Autonomy

| #   | Document                                                                   | Description                                              |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| 06  | [06-phase4-autonomy-architecture.md](./06-phase4-autonomy-architecture.md) | Autonomous execution, Multi-Agent Council, LLM synthesis |
| 07  | [07-phase4-usage-guide.md](./07-phase4-usage-guide.md)                     | User guide for Phase 4 features                          |

### Research & Analysis

| Document                                                       | Description                                           |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| [08-architecture-review.md](./08-architecture-review.md)       | Comprehensive architecture review and recommendations |
| [09-enhancement-research.md](./09-enhancement-research.md)     | Enhancement opportunities and integration research    |
| [SETTINGS_RESEARCH.md](./SETTINGS_RESEARCH.md)                 | Kilocode settings management integration              |
| [DARWIN_CLAUDE_CODE_PLUGIN.md](./DARWIN_CLAUDE_CODE_PLUGIN.md) | Claude Code Plugin specification with meta-evolution  |

## 🎯 Key Concepts

### The Evolution Loop

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Trace  →  Analyze  →  Propose  →  Validate  →  Apply     │
│     ↑                                              │        │
│     └──────────────────────────────────────────────┘        │
│                      (Continuous Loop)                       │
└─────────────────────────────────────────────────────────────┘
```

1. **Trace**: Capture execution data (tool use, errors, user feedback)
2. **Analyze**: Detect patterns like doom loops or capability gaps
3. **Propose**: Generate evolution proposals (new tools, rule updates)
4. **Validate**: Council system reviews proposals for safety
5. **Apply**: Evolution Manager applies approved changes

### Core Insights

| Insight                   | Description                                                     |
| ------------------------- | --------------------------------------------------------------- |
| **Modes are Agents**      | Custom Modes are the specialized agents - no new concept needed |
| **Delegation is Council** | `delegateParentAndOpenChild` enables multi-agent collaboration  |
| **Telemetry is Trace**    | Existing `TelemetryService` and `TaskHistory` provide the data  |
| **MCP is Tool Layer**     | Dynamic tool creation through MCP synthesis                     |
| **Evolution is a Task**   | Self-improvement is a visible, user-controllable process        |

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Darwin Evolution System                   │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐ │
│  │   Trace   │→→│  Analysis │→→│ Proposals │→→│  Council  │ │
│  │  System   │  │  Engine   │  │  System   │  │  System   │ │
│  └───────────┘  └───────────┘  └───────────┘  └─────┬─────┘ │
│                                                     ↓       │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐ │
│  │   Skills  │←←│  Change   │←←│ Evolution │←←│ Autonomous│ │
│  │  Library  │  │ Applicator│  │  Manager  │  │ Executor  │ │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 For Developers

### Code Location

The Darwin implementation lives in:

```
src/shared/evolution/
├── DarwinService.ts        # Main entry point
├── core/                   # Core types and utilities
├── trace/                  # Event capture
├── analysis/               # Pattern detection
├── proposals/              # Proposal generation
├── council/                # Governance system
├── skills/                 # Skill synthesis
├── application/            # Change application
├── autonomy/               # Auto-execution
└── state/                  # State management
```

### Running Tests

```bash
# From the src directory
cd src && pnpm test shared/evolution
```

### Key Interfaces

```typescript
// packages/types/src/evolution.ts
interface TraceEvent {
	/* Captured execution event */
}
interface EvolutionProposal {
	/* Proposed system change */
}
interface Skill {
	/* Synthesized capability */
}
interface CouncilResult {
	/* Review decision */
}
interface EvolutionState {
	/* System state */
}
```

## 📖 Reading Order

For comprehensive understanding, follow this path:

```
1. RESEARCH_SUMMARY.md     ─── Executive overview
         ↓
2. 01-analysis.md          ─── Problem space analysis
         ↓
3. 02-architecture.md      ─── System components
         ↓
4. 03-advanced-capabilities.md ─── Skills & evolution
         ↓
5. 04-unified-architecture.md  ─── Complete picture
         ↓
6. 05-implementation-roadmap.md ─── Implementation plan
         ↓
7. 06-07 (Phase 4 docs)    ─── Autonomous features
         ↓
8. 08-09 (Research docs)   ─── Deep analysis
```

## 🔗 Related Documentation

- [Contributing Guide](../../CONTRIBUTING.md)
- [Architecture Overview](../../apps/kilocode-docs/docs/contributing/architecture.md)
- [Types Package](../../packages/types/src/evolution.ts)

## 📝 Document Status

| Document                  | Status      | Last Updated |
| ------------------------- | ----------- | ------------ |
| Research Summary          | ✅ Complete | Dec 2024     |
| Core Architecture (01-05) | ✅ Complete | Dec 2024     |
| Phase 4 (06-07)           | ✅ Complete | Dec 2024     |
| Research (08-09)          | ✅ Complete | Dec 2024     |
| Settings Research         | ✅ Complete | Dec 2024     |
| Claude Code Plugin        | ✅ Complete | Dec 2024     |

---

_Darwin: Evolving the future of coding, one prompt at a time._
