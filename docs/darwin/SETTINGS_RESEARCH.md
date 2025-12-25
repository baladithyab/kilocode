# Kilocode Settings Management Research

## 1. Settings Architecture Overview

Kilocode uses a React-based settings UI in the webview, communicating with the extension host via message passing. Settings are persisted using VSCode's global state and secret storage.

### Component Structure

- **Main View**: [`webview-ui/src/components/settings/SettingsView.tsx`](webview-ui/src/components/settings/SettingsView.tsx)
    - Manages the vertical tab layout.
    - Handles state (cached vs. persisted).
    - Sends `updateSettings` messages to the extension.
- **Section Components**: Located in [`webview-ui/src/components/settings/`](webview-ui/src/components/settings/)
    - Examples: `ApiConfigManager.tsx`, `BrowserSettings.tsx`, `TerminalSettings.tsx`.
    - Each component receives specific settings as props and callbacks to update them.

### Data Flow

1.  **User Action**: User changes a setting in the UI.
2.  **State Update**: `SettingsView` updates its local `cachedState`.
3.  **Persistence**: User clicks "Save" (or auto-save triggers).
4.  **Message Passing**: `vscode.postMessage({ type: "updateSettings", updatedSettings: ... })` is sent.
5.  **Extension Handling**: [`src/core/webview/webviewMessageHandler.ts`](src/core/webview/webviewMessageHandler.ts) receives the message.
6.  **Storage**: `webviewMessageHandler` calls `ContextProxy.setValue` or `updateGlobalState`.
7.  **Persistence Layer**: [`src/core/config/ContextProxy.ts`](src/core/config/ContextProxy.ts) writes to `vscode.ExtensionContext.globalState` or `secrets`.

## 2. Settings Schema

Settings are defined using Zod schemas in [`packages/types/src/global-settings.ts`](packages/types/src/global-settings.ts).

### Key Interfaces

- `GlobalSettings`: General extension settings.
- `ProviderSettings`: API provider configurations.
- `RooCodeSettings`: Combined settings object.

### Example Schema Definition

```typescript
export const globalSettingsSchema = z.object({
	// ... existing settings
	alwaysAllowReadOnly: z.boolean().optional(),
	// Darwin settings will be added here
	darwinEnabled: z.boolean().optional(),
	darwinProfile: z.string().optional(),
})
```

## 3. Storage Mechanism

### Extension Storage

- **Global State**: `context.globalState` for non-sensitive data.
- **Secrets**: `context.secrets` for API keys and tokens.
- **Management**: `ContextProxy` class abstracts these storage mechanisms.

### CLI Storage

- **File**: `~/.kilocode/cli/config.json`.
- **Management**: [`cli/src/config/persistence.ts`](cli/src/config/persistence.ts).
- **Independence**: CLI settings are currently separate from extension settings.

## 4. Integration Pattern for Darwin

To add Darwin settings, follow this pattern:

### Step 1: Update Schema

Modify [`packages/types/src/global-settings.ts`](packages/types/src/global-settings.ts) to include Darwin-specific fields in `globalSettingsSchema`.

### Step 2: Create UI Component

Create `webview-ui/src/components/settings/DarwinSettings.tsx`:

```tsx
import React from "react"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { useTranslation } from "react-i18next"
import { Section } from "./Section"
import { SectionHeader } from "./SectionHeader"

interface DarwinSettingsProps {
	darwinEnabled: boolean
	setCachedStateField: (field: string, value: any) => void
}

export const DarwinSettings = ({ darwinEnabled, setCachedStateField }: DarwinSettingsProps) => {
	const { t } = useTranslation()
	return (
		<div>
			<SectionHeader>Darwin Configuration</SectionHeader>
			<Section>
				<div className="flex items-center gap-2">
					<VSCodeCheckbox
						checked={darwinEnabled}
						onChange={(e: any) => setCachedStateField("darwinEnabled", e.target.checked)}>
						Enable Darwin Features
					</VSCodeCheckbox>
				</div>
			</Section>
		</div>
	)
}
```

### Step 3: Register Section

Update [`webview-ui/src/components/settings/SettingsView.tsx`](webview-ui/src/components/settings/SettingsView.tsx):

1.  Add "darwin" to `sectionNames` array.
2.  Add icon to `sections` array.
3.  Render `DarwinSettings` component in the `TabContent`.

### Step 4: Update Message Handler

Update [`src/core/webview/webviewMessageHandler.ts`](src/core/webview/webviewMessageHandler.ts) to handle any specific logic for Darwin settings if simple persistence isn't enough (e.g., triggering a background process).

## 5. CLI Integration

If Darwin settings need to be accessible via CLI:

1.  Update `CLIConfig` interface in `cli/src/config/types.ts`.
2.  Update `DEFAULT_CONFIG` in `cli/src/config/defaults.ts`.
3.  CLI will automatically load/save these to its `config.json`.

## 6. Settings Synchronization

- **VSCode Sync**: `SettingsSyncService` syncs specific keys across VSCode instances. Add Darwin keys to `SYNC_KEYS` in [`src/services/settings-sync/SettingsSyncService.ts`](src/services/settings-sync/SettingsSyncService.ts) if they should be synced.
- **Extension-CLI Sync**: Currently no automatic sync. If Darwin requires shared state, consider using a shared configuration file or having the CLI query the extension (if running) or vice versa.

## 7. Implementation Plan

1.  **Schema**: Add `darwinEnabled`, `darwinMode`, etc., to `globalSettingsSchema`.
2.  **UI**: Create `DarwinSettings.tsx` and integrate into `SettingsView`.
3.  **Persistence**: Ensure `ContextProxy` handles new keys (automatic via schema).
4.  **Sync**: Add keys to `SettingsSyncService` for cross-device sync.
5.  **CLI**: (Optional) Add corresponding config to CLI if needed for standalone operation.
