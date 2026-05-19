import { copyToClipboard, type ExtensionAPI, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { visibleWidth } from "@mariozechner/pi-tui";
import { loadConfig, saveConfig } from "./config.js";
import { GlanceEditor } from "./editor.js";
import { renderFixedEditorCluster } from "./fixed-editor/cluster.js";
import { TerminalSplitCompositor } from "./fixed-editor/terminal-split.js";
import { GlanceFooterBridge } from "./footer-bridge.js";
import { GitRefresher } from "./git.js";
import { showGlancePane } from "./pane.js";
import {
	initVibeManager,
	onVibeBeforeAgentStart,
	onVibeAgentStart,
	onVibeToolCall,
	onVibeAgentEnd,
	getVibeTheme,
	setVibeTheme,
	getVibeModel,
	setVibeModel,
	getVibeMode,
	setVibeMode,
	hasVibeFile,
	getVibeFileCount,
	generateVibesBatch,
} from "./working-vibes.js";
import {
	clearContextUsage,
	computeUsageTotals,
	createInitialState,
	refreshContextUsage,
	refreshModel,
	refreshWorkspace,
	setGitSnapshot,
	setUsageTotals,
} from "./state.js";
import type { GlanceConfig, GlanceState } from "./types.js";

export default function piGlance(pi: ExtensionAPI): void {
	let config: GlanceConfig | undefined;
	let state: GlanceState | undefined;
	let footerBridge: GlanceFooterBridge | undefined;
	let gitRefresher: GitRefresher | undefined;
	let requestRender: (() => void) | undefined;
	let currentEditor: GlanceEditor | undefined;
	let currentTui: any = undefined;
	let fixedEditorCompositor: TerminalSplitCompositor | null = null;
	let fixedEditorContainer: any = null;
	let fixedStatusContainer: any = null;
	let fixedWidgetAbove: any = null;
	let fixedWidgetBelow: any = null;

	async function ensureConfig(): Promise<GlanceConfig> {
		config ??= await loadConfig();
		return config;
	}

	function getConfig(): GlanceConfig {
		if (!config) throw new Error("pi-glance config not loaded");
		return config;
	}

	function ensureState(ctx: ExtensionContext): GlanceState {
		if (!state) {
			state = createInitialState(ctx, getConfig(), pi.getThinkingLevel());
		}
		return state;
	}

	function renderNow(): void {
		footerBridge?.invalidate();
		requestRender?.();
	}

	function ensureGitRefresher(): GitRefresher {
		gitRefresher ??= new GitRefresher(
			() => getConfig().git,
			() => state?.workspace.path,
			(cwd, snapshot) => {
				if (state && setGitSnapshot(state, cwd, snapshot)) renderNow();
			},
		);
		return gitRefresher;
	}

	function scheduleGitRefresh(immediate = false): void {
		gitRefresher?.schedule(immediate);
	}

	function refreshReliableSnapshot(ctx: ExtensionContext, options: { model?: boolean; git?: boolean } = {}): void {
		if (!state) return;
		const workspaceChanged = refreshWorkspace(state, ctx);
		if (options.model) refreshModel(state, ctx, getConfig(), pi.getThinkingLevel());
		setUsageTotals(state, computeUsageTotals(ctx));
		refreshContextUsage(state, ctx);
		if (options.git || workspaceChanged) scheduleGitRefresh(options.git || workspaceChanged);
	}

	function refreshThinkingLevel(ctx: ExtensionContext): void {
		if (!state) return;
		refreshModel(state, ctx, getConfig(), pi.getThinkingLevel());
	}

	function clearBridge(): void {
		footerBridge?.dispose();
		footerBridge = undefined;
	}

	function clearGitRefresher(): void {
		gitRefresher?.dispose();
		gitRefresher = undefined;
	}

	// --- Fixed-editor compositor lifecycle ---

	function findContainerWithChild(tui: any, child: any): { container: any; index: number } | null {
		const children = Array.isArray(tui?.children) ? tui.children : [];
		const index = children.findIndex(
			(candidate: any) => Array.isArray(candidate?.children) && candidate.children.includes(child),
		);
		if (index === -1) return null;
		return { container: children[index], index };
	}

	function teardownFixedEditorCompositor(options?: { resetExtendedKeyboardModes?: boolean }): void {
		fixedEditorCompositor?.dispose(options);
		fixedEditorCompositor = null;
		fixedEditorContainer = null;
		fixedStatusContainer = null;
		fixedWidgetAbove = null;
		fixedWidgetBelow = null;
	}

	function installFixedEditorCompositor(ctx: ExtensionContext, tui: any): void {
		teardownFixedEditorCompositor();

		if (!ctx.hasUI || !getConfig().fixedEditor.enabled) return;

		if (!tui?.terminal || typeof tui.terminal.write !== "function") {
			console.warn("[pi-glance] Fixed editor compositor: tui.terminal.write() not found, skipping");
			return;
		}
		if (!currentEditor) {
			console.warn("[pi-glance] Fixed editor compositor: editor not installed yet, skipping");
			return;
		}

		const editorContainerMatch = findContainerWithChild(tui, currentEditor);
		if (!editorContainerMatch) {
			console.warn("[pi-glance] Fixed editor compositor: could not find editor container in TUI children");
			return;
		}

		const tuiChildren = Array.isArray(tui.children) ? tui.children : [];
		fixedEditorContainer = editorContainerMatch.container;

		// Status container is 2 positions before editor, widget above is 1 before
		const statusCandidate = tuiChildren[editorContainerMatch.index - 2] ?? null;
		fixedStatusContainer =
			statusCandidate && typeof statusCandidate.render === "function" ? statusCandidate : null;
		fixedWidgetAbove = tuiChildren[editorContainerMatch.index - 1] ?? null;
		fixedWidgetBelow = tuiChildren[editorContainerMatch.index + 1] ?? null;

		const feConfig = getConfig().fixedEditor;

		let compositor: TerminalSplitCompositor;
		compositor = new TerminalSplitCompositor({
			tui,
			terminal: tui.terminal,
			mouseScroll: feConfig.mouseScroll,
			keyboardScrollShortcuts: {
				up: feConfig.scrollUp,
				down: feConfig.scrollDown,
			},
			onCopySelection: (text: string) => copyToClipboard(text),
			getShowHardwareCursor: () => typeof tui.getShowHardwareCursor === "function" && tui.getShowHardwareCursor(),
			renderCluster: (width: number, terminalRows: number) => {
				const statusContainerLines = fixedStatusContainer
					? compositor.renderHidden(fixedStatusContainer, width).filter((line: string) => visibleWidth(line) > 0)
					: [];
				const aboveWidgetLines = fixedWidgetAbove
					? compositor.renderHidden(fixedWidgetAbove, width)
					: [];
				const belowWidgetLines = fixedWidgetBelow
					? compositor.renderHidden(fixedWidgetBelow, width)
					: [];

				return renderFixedEditorCluster({
					width,
					terminalRows,
					statusLines: [...aboveWidgetLines, ...statusContainerLines],
					editorLines: fixedEditorContainer
						? compositor.renderHidden(fixedEditorContainer, width)
						: [],
					secondaryLines: belowWidgetLines,
				});
			},
		});

		fixedEditorCompositor = compositor;
		if (fixedStatusContainer?.render) compositor.hideRenderable(fixedStatusContainer);
		if (fixedWidgetAbove?.render) compositor.hideRenderable(fixedWidgetAbove);
		compositor.hideRenderable(fixedEditorContainer);
		if (fixedWidgetBelow?.render) compositor.hideRenderable(fixedWidgetBelow);
		compositor.install();
		tui.requestRender(true);
	}

	// --- UI lifecycle ---

	function clearUI(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		teardownFixedEditorCompositor();
		clearBridge();
		clearGitRefresher();
		ctx.ui.setEditorComponent(undefined);
		ctx.ui.setFooter(undefined);
		currentEditor = undefined;
		currentTui = undefined;
		requestRender = undefined;
	}

	function installInputSurface(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		ensureState(ctx);
		const activeConfig = getConfig();
		if (!activeConfig.enabled) {
			clearUI(ctx);
			return;
		}

		ensureGitRefresher().schedule(true);
		clearBridge();

		ctx.ui.setFooter((tui, _theme, footerData) => {
			requestRender = () => tui.requestRender();
			currentTui = tui;
			footerBridge = new GlanceFooterBridge(() => state ?? ensureState(ctx), footerData);
			return footerBridge;
		});

		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			requestRender = () => tui.requestRender();
			currentTui = tui;
			const editor = new GlanceEditor(
				tui,
				theme,
				keybindings,
				() => state ?? ensureState(ctx),
				() => getConfig(),
				() => {
					refreshThinkingLevel(ctx);
					renderNow();
				},
			);
			currentEditor = editor;
			return editor;
		});

		// Install compositor immediately after editor factory runs (pi calls factories synchronously)
		if (activeConfig.fixedEditor.enabled && currentTui && currentEditor) {
			installFixedEditorCompositor(ctx, currentTui);
		}
	}

	pi.registerCommand("glance", {
		description: "Open pi-glance configuration pane",
		handler: async (_args, ctx) => {
			const current = await ensureConfig();
			ensureState(ctx);
			const result = await showGlancePane(current, ctx, state);
			if (result.action === "cancel") {
				ctx.ui.notify("pi-glance configuration cancelled", "info");
				return;
			}

			config = result.config;
			await saveConfig(config);
			if (state) {
				refreshReliableSnapshot(ctx, { model: true, git: true });
			}
			installInputSurface(ctx);
			renderNow();
			ctx.ui.notify("pi-glance configuration saved", "info");
		},
	});

	pi.registerCommand("glance-fixed-editor", {
		description: "Toggle pi-glance fixed-editor mode (pins input at bottom)",
		handler: async (args, ctx) => {
			const current = await ensureConfig();
			const normalizedArgs = (args ?? "").trim().toLowerCase();
			const mode = normalizedArgs === "on" ? true : normalizedArgs === "off" ? false : !current.fixedEditor.enabled;
			current.fixedEditor.enabled = mode;
			config = current;
			await saveConfig(config);

			if (mode) {
				installInputSurface(ctx);
				// Compositor will be installed after editor is mounted (see session_start / model_select hooks)
				if (currentTui && currentEditor) {
					installFixedEditorCompositor(ctx, currentTui);
				}
			} else {
				teardownFixedEditorCompositor();
			}
			renderNow();
			ctx.ui.notify(`pi-glance fixed-editor ${mode ? "enabled" : "disabled"}`, "info");
		},
	});

	// ─── /vibe command ────────────────────────────────────────────────────

	const VIBE_DEFAULT_MODEL = "openai-codex/gpt-5.4-mini";

	function vibeStatus(ctx: ExtensionContext): string {
		const theme = getVibeTheme();
		const model = getVibeModel();
		const mode = getVibeMode();
		if (!theme) return "Vibes: off";
		const modelLabel = model === VIBE_DEFAULT_MODEL ? "default" : model;
		let status = `Vibe: ${theme} (${mode} mode, model: ${modelLabel})`;
		if (mode === "file") {
			if (hasVibeFile(theme)) {
				status += ` — ${getVibeFileCount(theme)} vibes loaded`;
			} else {
				status += " — no vibe file, run /vibe generate";
			}
		}
		return status;
	}

	function showVibeStatus(ctx: ExtensionContext): void {
		ctx.ui.notify(vibeStatus(ctx), "info");
	}

	function trySetWorkingMessage(ctx: ExtensionContext, msg?: string): void {
		if (ctx.hasUI) ctx.ui.setWorkingMessage(msg);
	}

	pi.registerCommand("vibe", {
		description: "Set working message theme. Usage: /vibe [theme|off|mode|model|generate]",
		handler: async (args, ctx) => {
			const parts = (args ?? "").trim().split(/\s+/);
			const first = parts[0]?.toLowerCase();

			if (!first) {
				showVibeStatus(ctx);
				return;
			}

			// /vibe model [spec]
			if (first === "model") {
				const spec = parts.slice(1).join(" ").trim();
				if (!spec) {
					ctx.ui.notify(`Vibe model: ${getVibeModel()}`, "info");
				} else if (setVibeModel(spec)) {
					ctx.ui.notify(`Vibe model set to: ${spec}`, "info");
				} else {
					ctx.ui.notify("Failed to save vibe model", "error");
				}
				return;
			}

			// /vibe mode [generate|file]
			if (first === "mode") {
				const modeVal = parts[1]?.toLowerCase();
				if (!modeVal) {
					ctx.ui.notify(`Vibe mode: ${getVibeMode()}`, "info");
				} else if (modeVal === "generate" || modeVal === "file") {
					if (setVibeMode(modeVal)) {
						ctx.ui.notify(`Vibe mode set to: ${modeVal}`, "info");
					} else {
						ctx.ui.notify("Failed to save vibe mode", "error");
					}
				} else {
					ctx.ui.notify("Usage: /vibe mode [generate|file]", "error");
				}
				return;
			}

			// /vibe generate <theme> [count]
			if (first === "generate") {
				const theme = parts[1];
				const count = parseInt(parts[2] ?? "100", 10);
				if (!theme) {
					ctx.ui.notify("Usage: /vibe generate <theme> [count]", "error");
					return;
				}
				ctx.ui.notify(`Generating ${count} vibes for "${theme}"...`, "info");
				const result = await generateVibesBatch(theme, count);
				if (result.success) {
					ctx.ui.notify(`Generated ${result.count} vibes → ${result.filePath}`, "info");
				} else {
					ctx.ui.notify(`Failed: ${result.error}`, "error");
				}
				return;
			}

			// /vibe off
			if (first === "off") {
				if (setVibeTheme(null)) {
					ctx.ui.notify("Vibes disabled", "info");
				} else {
					ctx.ui.notify("Failed to disable vibes", "error");
				}
				return;
			}

			// /vibe <theme>
			const theme = args!.trim();
			const suffix = getVibeMode() === "file" && !hasVibeFile(theme)
				? ` (no file — run /vibe generate ${theme})`
				: "";
			if (setVibeTheme(theme)) {
				ctx.ui.notify(`Vibe set to: ${theme}${suffix}`, "info");
			} else {
				ctx.ui.notify("Failed to set vibe theme", "error");
			}
		},
	});

	// ─── Lifecycle events ────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		config = await loadConfig();
		state = createInitialState(ctx, config, pi.getThinkingLevel());
		initVibeManager(ctx);
		installInputSurface(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		clearUI(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		await ensureConfig();
		ensureState(ctx);
		refreshReliableSnapshot(ctx, { model: true, git: true });
		renderNow();
		// Re-install compositor after model switch (TUI may rebuild)
		if (getConfig().fixedEditor.enabled && currentTui && currentEditor) {
			installFixedEditorCompositor(ctx, currentTui);
		}
	});

	pi.on("before_agent_start", async (event, ctx) => {
		onVibeBeforeAgentStart(event.prompt, (msg) => trySetWorkingMessage(ctx, msg));
	});

	pi.on("agent_start", async (_event, _ctx) => {
		onVibeAgentStart();
	});

	pi.on("turn_start", async (_event, ctx) => {
		await ensureConfig();
		ensureState(ctx);
		refreshReliableSnapshot(ctx, { model: true });
		renderNow();
	});

	pi.on("tool_execution_start", async (event, ctx) => {
		// Vibe: refresh working message based on tool context
		if (event.toolName && event.args) {
			onVibeToolCall(event.toolName, event.args as Record<string, unknown>, (msg) => trySetWorkingMessage(ctx, msg));
		}
	});

	pi.on("tool_execution_end", async (_event, ctx) => {
		await ensureConfig();
		ensureState(ctx);
		refreshReliableSnapshot(ctx, { git: true });
		renderNow();
	});

	pi.on("session_tree", async (_event, ctx) => {
		await ensureConfig();
		ensureState(ctx);
		refreshReliableSnapshot(ctx, { model: true, git: true });
		renderNow();
	});

	pi.on("session_compact", async (_event, ctx) => {
		await ensureConfig();
		ensureState(ctx);
		refreshWorkspace(state!, ctx);
		refreshModel(state!, ctx, getConfig(), pi.getThinkingLevel());
		setUsageTotals(state!, computeUsageTotals(ctx));
		clearContextUsage(state!, ctx);
		scheduleGitRefresh(true);
		renderNow();
	});

	pi.on("message_end", async (event, ctx) => {
		await ensureConfig();
		ensureState(ctx);
		if (event.message.role === "assistant") {
			refreshReliableSnapshot(ctx);
			renderNow();
		}
	});

	pi.on("turn_end", async (_event, ctx) => {
		await ensureConfig();
		ensureState(ctx);
		refreshReliableSnapshot(ctx);
		renderNow();
	});

	pi.on("agent_end", async (_event, ctx) => {
		await ensureConfig();
		ensureState(ctx);
		refreshReliableSnapshot(ctx);
		renderNow();
		onVibeAgentEnd((msg) => trySetWorkingMessage(ctx, msg));
	});
}
