import { useState } from "react"
import { VSCodeButton, VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { Sparkles, Shield, Zap, Brain, CheckCircle, AlertTriangle } from "lucide-react"
import { DEFAULT_DARWIN_CONFIG, DarwinConfig } from "@roo-code/types"

interface DarwinSetupWizardProps {
	onComplete: (config: DarwinConfig) => void
	onCancel: () => void
}

export const DarwinSetupWizard = ({ onComplete, onCancel }: DarwinSetupWizardProps) => {
	const [step, setStep] = useState(1)
	const [config, setConfig] = useState<DarwinConfig>({
		...DEFAULT_DARWIN_CONFIG,
		enabled: true,
	})

	const handleNext = () => setStep(step + 1)
	const handleBack = () => setStep(step - 1)

	const updateConfig = (key: keyof DarwinConfig, value: any) => {
		setConfig((prev) => ({ ...prev, [key]: value }))
	}

	return (
		<div className="flex flex-col h-full p-6 bg-vscode-editor-background text-vscode-foreground">
			<div className="flex items-center gap-3 mb-6">
				<Sparkles className="w-6 h-6 text-vscode-textLink-foreground" />
				<h1 className="text-xl font-bold">Darwin Evolution System Setup</h1>
			</div>

			<div className="flex-1 overflow-y-auto">
				{step === 1 && (
					<div className="space-y-4">
						<h2 className="text-lg font-semibold">Welcome to Darwin</h2>
						<p className="text-vscode-descriptionForeground">
							Darwin enables Kilo Code to learn from your interactions, synthesize new skills, and
							autonomously improve over time.
						</p>
						<div className="grid grid-cols-1 gap-4 mt-4">
							<div className="p-4 border border-vscode-editorWidget-border rounded-md">
								<div className="flex items-center gap-2 mb-2">
									<Brain className="w-5 h-5" />
									<span className="font-medium">Continuous Learning</span>
								</div>
								<p className="text-sm text-vscode-descriptionForeground">
									Detects patterns in your tasks and proposes improvements.
								</p>
							</div>
							<div className="p-4 border border-vscode-editorWidget-border rounded-md">
								<div className="flex items-center gap-2 mb-2">
									<Zap className="w-5 h-5" />
									<span className="font-medium">Skill Synthesis</span>
								</div>
								<p className="text-sm text-vscode-descriptionForeground">
									Creates new tools and workflows to automate repetitive tasks.
								</p>
							</div>
							<div className="p-4 border border-vscode-editorWidget-border rounded-md">
								<div className="flex items-center gap-2 mb-2">
									<Shield className="w-5 h-5" />
									<span className="font-medium">Safe & Controlled</span>
								</div>
								<p className="text-sm text-vscode-descriptionForeground">
									You stay in control with granular permissions and review processes.
								</p>
							</div>
						</div>
					</div>
				)}

				{step === 2 && (
					<div className="space-y-4">
						<h2 className="text-lg font-semibold">Choose Capabilities</h2>
						<p className="text-vscode-descriptionForeground">
							Select which features you want to enable. You can change these later in settings.
						</p>

						<div className="space-y-3 mt-4">
							<div className="flex items-start gap-3">
								<VSCodeCheckbox
									checked={config.enableSkillSynthesis}
									onChange={(e: any) => updateConfig("enableSkillSynthesis", e.target.checked)}>
									Skill Synthesis
								</VSCodeCheckbox>
								<p className="text-xs text-vscode-descriptionForeground mt-1">
									Allow creating new tools from successful workflows.
								</p>
							</div>

							<div className="flex items-start gap-3">
								<VSCodeCheckbox
									checked={config.enableMultiAgentCouncil}
									onChange={(e: any) => updateConfig("enableMultiAgentCouncil", e.target.checked)}>
									Multi-Agent Council
								</VSCodeCheckbox>
								<p className="text-xs text-vscode-descriptionForeground mt-1">
									Use specialized agents to review proposals for safety and quality.
								</p>
							</div>

							<div className="flex items-start gap-3">
								<VSCodeCheckbox
									checked={config.enableSelfHealing}
									onChange={(e: any) => updateConfig("enableSelfHealing", e.target.checked)}>
									Self-Healing
								</VSCodeCheckbox>
								<p className="text-xs text-vscode-descriptionForeground mt-1">
									Automatically detect and fix common errors.
								</p>
							</div>

							<div className="flex items-start gap-3">
								<VSCodeCheckbox
									checked={config.enableAutonomousExecution}
									onChange={(e: any) => updateConfig("enableAutonomousExecution", e.target.checked)}>
									Autonomous Execution
								</VSCodeCheckbox>
								<p className="text-xs text-vscode-descriptionForeground mt-1">
									Allow Darwin to execute approved proposals automatically.
								</p>
							</div>
						</div>
					</div>
				)}

				{step === 3 && (
					<div className="space-y-4">
						<h2 className="text-lg font-semibold">Execution Environment</h2>
						<p className="text-vscode-descriptionForeground">
							Choose how synthesized skills should be executed.
						</p>

						<div className="mt-4">
							<label className="block mb-2 font-medium">Skill Execution Mode</label>
							<VSCodeDropdown
								value={config.skillExecutionMode}
								onChange={(e: any) => updateConfig("skillExecutionMode", e.target.value)}
								className="w-full">
								<VSCodeOption value="default">Default (Standard)</VSCodeOption>
								<VSCodeOption value="docker-isolated">Docker Isolated (Recommended)</VSCodeOption>
							</VSCodeDropdown>

							{config.skillExecutionMode === "docker-isolated" && (
								<div className="mt-2 p-3 bg-vscode-inputValidation-infoBackground border border-vscode-inputValidation-infoBorder rounded-md text-sm flex items-start gap-2">
									<AlertTriangle className="w-4 h-4 text-vscode-inputValidation-infoForeground mt-0.5" />
									<p>
										Docker isolation requires Docker to be installed and running on your system.
										This provides the highest level of security for executing new skills.
									</p>
								</div>
							)}
						</div>
					</div>
				)}

				{step === 4 && (
					<div className="space-y-4 text-center">
						<div className="flex justify-center mb-4">
							<CheckCircle className="w-16 h-16 text-vscode-testing-iconPassed" />
						</div>
						<h2 className="text-lg font-semibold">Ready to Evolve</h2>
						<p className="text-vscode-descriptionForeground">
							Darwin is now configured and ready to help you improve your workflow.
						</p>
						<div className="p-4 bg-vscode-editor-background border border-vscode-editorWidget-border rounded-md text-left text-sm">
							<p>
								<strong>Summary:</strong>
							</p>
							<ul className="list-disc list-inside mt-2 space-y-1">
								<li>Skill Synthesis: {config.enableSkillSynthesis ? "Enabled" : "Disabled"}</li>
								<li>Council Review: {config.enableMultiAgentCouncil ? "Enabled" : "Disabled"}</li>
								<li>Execution Mode: {config.skillExecutionMode}</li>
							</ul>
						</div>
					</div>
				)}
			</div>

			<div className="flex justify-between mt-6 pt-4 border-t border-vscode-editorWidget-border">
				{step > 1 ? (
					<VSCodeButton appearance="secondary" onClick={handleBack}>
						Back
					</VSCodeButton>
				) : (
					<VSCodeButton appearance="secondary" onClick={onCancel}>
						Cancel
					</VSCodeButton>
				)}

				{step < 4 ? (
					<VSCodeButton onClick={handleNext}>Next</VSCodeButton>
				) : (
					<VSCodeButton onClick={() => onComplete(config)}>Finish Setup</VSCodeButton>
				)}
			</div>
		</div>
	)
}
