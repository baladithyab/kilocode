# Darwin Evolution System Documentation

The Darwin Evolution System transforms Kilocode from a static development tool into a self-improving AI coding assistant. This documentation covers the architecture, design, and implementation of this system.

## Overview

Darwin enables Kilocode to:

- **Autonomous Skill Synthesis**: Detect capability gaps and write its own tools (Skills) to fill them
- **Deep Configuration Evolution**: Optimize every aspect of Kilocode based on success patterns
- **Project-Local Adaptation**: Leverage `.kilocodemodes` and `.kilocoderules` for workspace-specific behavior
- **Self-Healing Workflows**: Detect and break "doom loops" (repetitive failures)

## Documentation Structure

| Document                                                                   | Description                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [01-analysis.md](./01-analysis.md)                                         | Initial analysis of Darwin patterns and how they map to Kilocode's architecture                               |
| [02-architecture.md](./02-architecture.md)                                 | Detailed architectural design including components, data schemas, and sequence diagrams                       |
| [03-advanced-capabilities.md](./03-advanced-capabilities.md)               | Advanced capabilities including Anthropic's Skills pattern, configuration evolution, and local mode overrides |
| [04-unified-architecture.md](./04-unified-architecture.md)                 | Unified architecture combining all concepts into a cohesive system design                                     |
| [05-implementation-roadmap.md](./05-implementation-roadmap.md)             | Phased implementation plan with tasks, testing requirements, and success criteria                             |
| [06-phase4-autonomy-architecture.md](./06-phase4-autonomy-architecture.md) | Detailed architecture for Phase 4: Autonomous Execution, Multi-Agent Council, and LLM Synthesis               |
| [07-phase4-usage-guide.md](./07-phase4-usage-guide.md)                     | User guide for configuring and using Phase 4 features                                                         |

## Reading Order

For the best understanding, read the documents in numerical order:

1. **Analysis** - Understand the problem space and initial mapping
2. **Architecture** - Deep dive into system components
3. **Advanced Capabilities** - Learn about skill synthesis and evolution strategies
4. **Unified Architecture** - See how everything fits together
5. **Implementation Roadmap** - Follow the step-by-step implementation plan
6. **Phase 4 Architecture** - Understand the autonomous execution engine
7. **Phase 4 Usage Guide** - Learn how to use the new capabilities

## Core Concepts

### The Evolution Loop

```
Trace → Analyze → Propose → Validate → Apply
```

1. **Trace**: Capture execution data (tool use, errors, user feedback)
2. **Analyze**: Detect patterns like doom loops or capability gaps
3. **Propose**: Generate evolution proposals (new tools, rule updates)
4. **Validate**: Council system reviews proposals for safety
5. **Apply**: Evolution Manager applies approved changes

### Key Components

- **Trace System**: Captures high-fidelity execution events
- **Analysis Engine**: Detects patterns and improvement opportunities
- **Proposal System**: Generates structured change proposals
- **Council System**: Multi-agent review board for validation
- **Evolution Manager**: Applies approved changes
- **Skills Library**: Repository of synthesized capabilities

## Related Documentation

- [Contributing Guide](../../CONTRIBUTING.md)
- [Development Setup](../../DEVELOPMENT.md)
- [Architecture Overview](../../apps/kilocode-docs/docs/contributing/architecture.md)
