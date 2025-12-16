---
"kilocode": minor
---

Evolution Layer: UI-Driven Automation Workflow

Refactored the Evolution Layer from manual CLI-driven workflow to a fully automated, UI-driven experience:

**New Features:**

- **Evolution Settings Panel**: Dedicated UI tab for all Evolution configuration
    - Council member selection from available profiles
    - Automation level selector (0-3) with one-click configuration
    - Quick Action buttons for common Evolution commands
    - Status Dashboard showing current state and activity
- **Automated Proposal Application**:
    - Level 2+ automatically applies safe changes (mode-map, docs)
    - Level 1 shows approval prompts with Apply button
    - Automatic backup creation before applying proposals
    - Rollback functionality with audit trail
- **Backend Message Handlers**:
    - `evolution.requestState` - Get current configuration state
    - `evolution.configure` - Save council member selection
    - `evolution.setAutomationLevel` - Set automation level with defaults

**UI Components Added:**

- `webview-ui/src/components/settings/EvolutionSettings.tsx` - Main panel
- `webview-ui/src/components/settings/evolution/CouncilConfig.tsx` - Council selector
- `webview-ui/src/components/settings/evolution/AutomationLevelSelector.tsx` - Level selector
- `webview-ui/src/components/settings/evolution/QuickActions.tsx` - Action buttons
- `webview-ui/src/components/settings/evolution/StatusDashboard.tsx` - Status display

**Backend Services Added:**

- `src/services/evolution/ProposalApplicationService.ts` - Automated proposal application
- `src/services/evolution/EvolutionWebviewHandler.ts` - Webview message handling
- Comprehensive test coverage for safety-critical proposal automation

**Bug Fixes:**

- Fixed command registration causing duplicate "Kilo Code: Kilo Code:" prefix

**Documentation:**

- Updated all Evolution Layer docs to emphasize UI-first workflow
- Added `evolution-quick-start.md` for 5-minute getting started guide
- Command Palette methods moved to "Alternative" sections

**Migration Notes:**
Users can now configure Evolution entirely through Settings UI instead of manual YAML editing and Command Palette commands.
