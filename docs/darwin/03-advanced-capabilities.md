# Darwin Advanced Capabilities & Evolution Architecture

This document outlines the research and design for "Darwin," the self-evolution engine for Kilocode. It details how Darwin leverages Anthropic's code-execution patterns, evolves project configuration, and integrates with Kilocode's core features.

## 1. Anthropic Skills Pattern Analysis

### Code Execution as Skill Synthesis

Anthropic's "code execution" pattern fundamentally shifts agent capabilities from static tool definitions to dynamic code synthesis. Instead of pre-loading thousands of tool definitions (which consumes vast context tokens), the agent is given a general-purpose code execution environment (sandbox).

- **Traditional MCP**: Agent sees `read_file`, `write_file`, `list_files`.
- **Skills Pattern**: Agent sees `execute_code`. To "read a file," it writes code to read the file. To "analyze data," it writes code to process the data.

### Context Token Reduction

By moving logic out of the prompt and into the sandbox, context usage is drastically reduced (up to 98%).

- **Discovery**: The agent discovers available tools/APIs by exploring the environment (e.g., listing files in a `servers/` directory) rather than having them all dumped into the system prompt.
- **On-Demand Loading**: The agent reads only the specific tool definitions it needs for the current task.
- **Synthesis**: The agent combines multiple primitive operations into a single "skill" (script) that runs in the sandbox, returning only the final result.

### Application to Kilocode Darwin

Darwin will adopt this pattern to evolve Kilocode's capabilities:

1.  **Skill Synthesis**: Darwin will write "skills" (TypeScript/Python scripts) that encapsulate complex workflows.
2.  **Dynamic Tooling**: Instead of just static MCP servers, Darwin will generate ad-hoc tools for specific projects.
3.  **Self-Correction**: If a skill fails, Darwin can read the error, modify the code, and retry—effectively "learning" how to use a tool or API.

## 2. Configuration Evolution Matrix

Darwin will systematically evolve Kilocode's configuration based on learning signals.

| Configuration           | Location         | Current State    | Evolution Strategy                        | Learning Signals                        | Validation Method      |
| :---------------------- | :--------------- | :--------------- | :---------------------------------------- | :-------------------------------------- | :--------------------- |
| **Mode Definitions**    | `.kilocodemodes` | Static JSON/YAML | Dynamic generation based on project needs | Task types, tool usage patterns         | A/B testing of prompts |
| **Mode Temperature**    | `.kilocodemodes` | Fixed per mode   | Adaptive per task complexity              | Success rate vs. temperature            | Regression testing     |
| **Tool Permissions**    | Mode `groups`    | Manual allowlist | Auto-grant based on verified safety       | Tool denial frequency, user approvals   | Security sandbox check |
| **Custom Instructions** | `.kilocodemodes` | Static text      | Evolving "wisdom" from past tasks         | User corrections, clarified ambiguities | User feedback loop     |
| **Project Rules**       | `.kilocoderules` | Static Markdown  | Auto-refined guidelines                   | Linter errors, PR comments              | Rule adherence check   |
| **Auto-Approval**       | `settings.json`  | Binary (on/off)  | Context-aware confidence thresholds       | User intervention rate                  | Safety violation rate  |
| **Model Selection**     | `Task Settings`  | Manual selection | Auto-select based on task difficulty      | Cost/performance ratio                  | Benchmark tasks        |
| **Context Strategy**    | `settings.json`  | Fixed window     | Dynamic sliding/summarization             | Token limit hits, context loss          | Recall accuracy        |

## 3. Local Mode Override Design

Kilocode's mode system (`src/shared/modes.ts`) already supports a precedence hierarchy that Darwin can leverage.

### Precedence Hierarchy

1.  **Project Modes** (`.kilocodemodes` in workspace): Highest priority. Overrides everything.
2.  **Global Modes** (`custom_modes.yaml` in user data): User-specific overrides.
3.  **Built-in Modes** (`DEFAULT_MODES` in `mode.ts`): Hardcoded defaults.

### Evolution Workflow

1.  **Detection**: Darwin identifies that the built-in "Code" mode is suboptimal for a specific project (e.g., a Rust project needing specific borrow-checker reasoning).
2.  **Drafting**: Darwin creates a new mode definition in `.kilocodemodes` with the same slug (`code`) but specialized `roleDefinition` and `customInstructions`.
3.  **Application**: Kilocode automatically loads this project-specific "Code" mode, effectively "patching" the agent for this workspace.
4.  **Refinement**: Darwin monitors task success. If the new mode performs worse, it reverts or tweaks the definition.

### Safety Considerations

- **Sandboxing**: Project modes cannot grant permissions (like shell access) that the user hasn't globally approved.
- **Transparency**: The UI must clearly indicate when a built-in mode is being overridden by a project mode.

## 4. Feature Integration Map

| Feature                | Current Capability                   | Darwin Enhancement Opportunity                                                                                    | Priority |
| :--------------------- | :----------------------------------- | :---------------------------------------------------------------------------------------------------------------- | :------- |
| **Context Management** | Sliding window, summarization events | **Smart Context**: Darwin predicts which files/docs are relevant before the task starts, pre-loading context.     | High     |
| **Tool System**        | Static MCP, native tools             | **Ad-hoc Tools**: Darwin generates temporary tools for one-off tasks (e.g., "migrate database script").           | High     |
| **Task Management**    | Parent/child delegation, history     | **Auto-Delegation**: Darwin analyzes task complexity and automatically spawns child tasks with specialized modes. | Medium   |
| **History & Learning** | Linear history storage               | **Semantic Memory**: Darwin indexes past successful tasks to "remember" solutions to recurring problems.          | High     |
| **Telemetry**          | Event tracking                       | **Performance Profiling**: Darwin uses telemetry to identify bottlenecks in its own workflow.                     | Low      |
| **Evals**              | Static benchmarks                    | **Continuous Eval**: Darwin runs regression tests on itself after modifying configuration.                        | Medium   |
| **Shell Integration**  | Command execution                    | **Shell Synthesis**: Darwin writes complex shell scripts instead of running one-off commands.                     | Medium   |
| **Auto-Approval**      | Basic thresholds                     | **Trust Scoring**: Darwin builds a "trust score" for operations, requesting approval only for high-risk actions.  | High     |

## 5. Skills Library Architecture

The Skills Library is the repository of Darwin's learned capabilities.

### Concept: "Skill" vs. "Tool"

- **Tool**: A primitive operation (e.g., `read_file`, `execute_command`).
- **Skill**: A higher-order capability composed of tools and logic (e.g., "Refactor React Component", "Analyze SQL Performance").

### Architecture

1.  **Storage**: Skills are stored as simple TypeScript/Python files in a `.kilocode/skills/` directory.
2.  **Metadata**: Each skill has a frontmatter header defining its inputs, outputs, and required permissions.
3.  **Discovery**: A lightweight "Skill Registry" indexes these files.
4.  **Execution**:
    - Darwin calls `use_skill(name, args)`.
    - The system reads the skill file.
    - The code is executed in the sandbox (or via `execute_command` if trusted).
    - Result is returned to context.

### Integration

- **MCP Bridge**: The Skills Library can be exposed as a local MCP server, allowing any MCP-compliant agent to use Darwin's skills.
- **Context Reduction**: The agent only needs to know the _list_ of skills, not their implementation.

## 6. Advanced Evolution Scenarios

### Scenario 1: Auto-Tuning Mode Temperature

- **Trigger**: Darwin notices that "Architect" mode tasks often require multiple revisions (hallucinations).
- **Action**: Darwin modifies `.kilocodemodes` to lower the `temperature` for the "Architect" mode from 0.7 to 0.4.
- **Validation**: Darwin tracks the "revision rate" for subsequent Architect tasks. If it drops, the change is kept.

### Scenario 2: Synthesizing Project-Specific Tools

- **Trigger**: The user frequently asks to "deploy to staging". This involves a complex sequence of 5 git commands and a script execution.
- **Action**: Darwin writes a `deploy_staging.sh` script and adds a "Deploy" skill to the Skills Library that wraps this script.
- **Result**: Future requests to "deploy" are handled by a single `use_skill('deploy')` call, saving tokens and reducing error prone manual steps.

### Scenario 3: Evolving `.kilocoderules`

- **Trigger**: The user repeatedly corrects the agent: "Don't use `any` type in TypeScript".
- **Action**: Darwin analyzes the chat history, identifies the recurring correction, and appends "Strictly avoid `any` type; use `unknown` or specific types" to `.kilocoderules`.
- **Result**: The rule is now part of the system prompt for all future tasks in this project.

### Scenario 4: Project-Local Mode Override

- **Trigger**: A project uses a custom internal framework that standard LLMs don't know.
- **Action**: Darwin scrapes the framework's documentation (using `browser_action`) and creates a custom "Framework Expert" mode in `.kilocodemodes` with the documentation summarized in its system prompt.
- **Result**: The agent now has "innate" knowledge of the internal framework without needing to look up docs for every task.

### Scenario 5: Optimized Context Selection

- **Trigger**: Tasks involving `UserAuth.ts` frequently fail because `UserPolicy.ts` is also needed but not loaded.
- **Action**: Darwin learns the correlation (co-occurrence) between these files.
- **Result**: When `UserAuth.ts` is mentioned in a future task, Darwin automatically suggests adding `UserPolicy.ts` to the context.
