// working-vibes.ts
// Themed working messages with built-in phrase pools, file-based, or AI-generated modes.
// Uses module-level state (matching powerline-footer pattern).

import { complete, type Context } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

type VibeMode = "random" | "generate" | "file";

// ═══════════════════════════════════════════════════════════════════════════
// Built-in Phrase Pools (random mode)
// ═══════════════════════════════════════════════════════════════════════════

const BUILTIN_VIBES: Record<string, string[]> = {
  "star trek": [
    "Engaging warp drive...",
    "Scanning star charts...",
    "Running diagnostics...",
    "Recalibrating sensors...",
    "Hailing frequencies open...",
    "Analyzing anomaly...",
    "Reprogramming the deflector...",
    "Setting course...",
    "Reversing the polarity...",
    "Consulting the ship's computer...",
    "Initiating deep scan...",
    "Adjusting shields...",
    "Plotting new trajectory...",
    "Decoding transmission...",
    "Initializing transport...",
  ],
  "pirate": [
    "Plundering the codebase...",
    "Charting unknown waters...",
    "Hoisting the main sail...",
    "Searching for buried treasure...",
    "Loading the cannons...",
    "Reading the treasure map...",
    "Walking the plank...",
    "Splicing the mainbrace...",
    "Scanning the horizon...",
    "Anchoring in safe harbor...",
    "Unearthing doubloons...",
    "Battening down the hatches...",
    "Setting sail for adventure...",
    "Decoding the ancient scroll...",
    "Navigating by the stars...",
  ],
  "silicon valley": [
    "Pivoting the paradigm...",
    "Disrupting the stack...",
    "Iterating on the MVP...",
    "Scaling the blockchain...",
    "Optimizing the funnel...",
    "Running the numbers...",
    "Leveraging synergy...",
    "Moving the needle...",
    "Going viral...",
    "Unicorn hunting...",
    "Raising the Series A...",
    "Pivoting to video...",
    "Dogfooding the product...",
    "Shipping to production...",
    "Sprinting to launch...",
  ],
  "zen": [
    "Contemplating the void...",
    "Finding the path...",
    "Listening to the breeze...",
    "Flowing like water...",
    "Breathing in stillness...",
    "Observing the moment...",
    "Planting seeds of wisdom...",
    "Raking the garden...",
    "Watching the bamboo sway...",
    "Meditating on the answer...",
    "Finding inner peace...",
    "Polishing the stone...",
    "Sitting with the question...",
    "Letting go of attachment...",
    "Becoming the mountain...",
  ],
  "dark souls": [
    "You died. Retrying...",
    "Touching the bonfire...",
    "Estus flask empty...",
    "Praise the sun...",
    "Dodging the inevitable...",
    "Rolling through the pain...",
    "Kindling the flame...",
    "Summoning help...",
    "Exploring the abyss...",
    "Bearing the curse...",
    "Reading the soapstone...",
    "Ascending the throne...",
    "Embracing the dark...",
    "Learning from death...",
    "The fire fades...",
  ],
  "noir": [
    "Following the trail...",
    "Lighting a cigarette...",
    "Peering through the blinds...",
    "Connecting the dots...",
    "Digging up the past...",
    "Walking the mean streets...",
    "Staking out the joint...",
    "Reading the file...",
    "Following the money...",
    "Cracking the case...",
    "Questioning suspects...",
    "Piecing it together...",
    "Connecting the clues...",
    "Chasing shadows...",
    "Fading to black...",
  ],
  "cowboy": [
    "Saddling up...",
    "Riding the range...",
    "Lassoing the problem...",
    "Taming the wild west...",
    "Blazing the trail...",
    "Rounding up the herd...",
    "Moseying along...",
    "Checking the perimeter...",
    "Drawing fast...",
    "Hitting the dusty trail...",
    "Tipping the hat...",
    "Bridling the stallion...",
    "Roping the stray...",
    "Posting up at the saloon...",
    "High noon approaching...",
  ],
  "space": [
    "Launching into orbit...",
    "Exploring new frontiers...",
    "Calculating trajectory...",
    "Breaching the atmosphere...",
    "Drifting through the cosmos...",
    "Charting the nebula...",
    "Docking at the station...",
    "Deploying the satellite...",
    "Entering hyperspace...",
    "Scanning the asteroid field...",
    "Receiving transmission...",
    "Traversing the wormhole...",
    "Igniting the thrusters...",
    "Mapping the galaxy...",
    "Traversing the void...",
  ],
};

// Generic pool used when theme doesn't match any built-in
const GENERIC_VIBES = [
  "Channeling the vibes...",
  "Consulting the oracle...",
  "Mixing the potion...",
  "Sharpening the tools...",
  "Reading the signs...",
  "Following the thread...",
  "Unraveling the mystery...",
  "Gathering the pieces...",
  "Preparing the ingredients...",
  "Distilling the essence...",
  "Chasing the answer...",
  "Polishing the gem...",
  "Sifting through the data...",
  "Connecting the dots...",
  "Following the scent...",
];

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_MODEL = "openai-codex/gpt-5.4-mini";

const DEFAULT_PROMPT = `Generate a 2-4 word "{theme}" themed loading message ending in "...".

Task: {task}

Be creative and unexpected. Avoid obvious/clichéd phrases for this theme.
The message should hint at the task using theme vocabulary.
{exclude}
Output only the message, nothing else.`;

const BATCH_PROMPT = `Generate {count} unique 2-4 word loading messages for a "{theme}" theme.
Each message should end with "..."
Be creative, varied, and thematic. No duplicates.
Output one message per line, nothing else. No numbering, no bullets.`;

const VIBE_SYSTEM_PROMPT = "You generate short themed loading messages and reply with the requested text only.";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface VibeConfig {
  theme: string | null;        // null = disabled
  mode: VibeMode;              // "random" (built-in), "generate" (AI), or "file" (pre-generated)
  modelSpec: string;           // default: "openai-codex/gpt-5.4-mini"
  fallback: string;            // default: "Working"
  timeout: number;             // default: 3000ms
  refreshInterval: number;     // default: 10000ms (10s)
  promptTemplate: string;      // template with {theme}, {task}, {exclude} placeholders
  maxLength: number;           // default: 65 chars
}

interface VibeGenContext {
  theme: string;
  userPrompt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Module-level State
// ═══════════════════════════════════════════════════════════════════════════

let config: VibeConfig = loadConfig();
let extensionCtx: ExtensionContext | null = null;
let currentGeneration: AbortController | null = null;
let isStreaming = false;
let lastVibeTime = 0;
let nextRefreshMs = 4000 + Math.random() * 4000; // random 4-8s

// Random mode state
let randomIndex = 0;

// File-based mode state
let vibeCache: string[] = [];
let vibeCacheTheme: string | null = null;
let vibeSeed = Date.now();
let vibeIndex = 0;

// Recent vibes tracking (to avoid repetition in generate mode)
const MAX_RECENT_VIBES = 5;
let recentVibes: string[] = [];

// ═══════════════════════════════════════════════════════════════════════════
// Configuration Management
// ═══════════════════════════════════════════════════════════════════════════

function getSettingsPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || homedir();
  return join(homeDir, ".pi", "agent", "settings.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSettingsForLoad(): Record<string, unknown> {
  const settingsPath = getSettingsPath();
  try {
    if (!existsSync(settingsPath)) return {};
    const parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
    if (!isRecord(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function readSettingsForWrite(scope: string): Record<string, unknown> | null {
  const settingsPath = getSettingsPath();
  if (!existsSync(settingsPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
    if (!isRecord(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistSettings(settings: Record<string, unknown>): boolean {
  const settingsPath = getSettingsPath();
  try {
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

function loadConfig(): VibeConfig {
  const settings = readSettingsForLoad();
  const rawTheme = typeof settings.workingVibe === "string" ? settings.workingVibe : null;
  const theme = rawTheme?.toLowerCase() === "off" ? null : rawTheme;

  const rawMode = settings.workingVibeMode;
  const mode: VibeMode = rawMode === "file" || rawMode === "generate" || rawMode === "random" ? rawMode : "random";

  const refreshSeconds =
    typeof settings.workingVibeRefreshInterval === "number" && Number.isFinite(settings.workingVibeRefreshInterval)
      ? Math.max(0, settings.workingVibeRefreshInterval)
      : 10;

  const maxLength =
    typeof settings.workingVibeMaxLength === "number" && Number.isFinite(settings.workingVibeMaxLength)
      ? Math.max(4, Math.floor(settings.workingVibeMaxLength))
      : 65;

  return {
    theme,
    mode,
    modelSpec: typeof settings.workingVibeModel === "string" ? settings.workingVibeModel : DEFAULT_MODEL,
    fallback: typeof settings.workingVibeFallback === "string" ? settings.workingVibeFallback : "Working",
    timeout: 3000,
    refreshInterval: refreshSeconds * 1000,
    promptTemplate: typeof settings.workingVibePrompt === "string" ? settings.workingVibePrompt : DEFAULT_PROMPT,
    maxLength,
  };
}

function saveConfig(): boolean {
  const settings = readSettingsForWrite("workingVibe");
  if (!settings) return false;
  if (config.theme === null) {
    delete settings.workingVibe;
  } else {
    settings.workingVibe = config.theme;
  }
  return persistSettings(settings);
}

function saveModelConfig(): boolean {
  const settings = readSettingsForWrite("workingVibeModel");
  if (!settings) return false;
  if (config.modelSpec === DEFAULT_MODEL) {
    delete settings.workingVibeModel;
  } else {
    settings.workingVibeModel = config.modelSpec;
  }
  return persistSettings(settings);
}

function saveModeConfig(): boolean {
  const settings = readSettingsForWrite("workingVibeMode");
  if (!settings) return false;
  if (config.mode === "random") {
    delete settings.workingVibeMode;
  } else {
    settings.workingVibeMode = config.mode;
  }
  return persistSettings(settings);
}

// ═══════════════════════════════════════════════════════════════════════════
// Random Mode — Built-in Phrase Pools
// ═══════════════════════════════════════════════════════════════════════════

function getPoolForTheme(theme: string): string[] {
  const key = theme.toLowerCase().trim();
  // Exact match first
  if (BUILTIN_VIBES[key]) return BUILTIN_VIBES[key];
  // Partial match (e.g. "star trek tos" matches "star trek")
  for (const [k, v] of Object.entries(BUILTIN_VIBES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  // No match — return generic
  return GENERIC_VIBES;
}

function getNextRandomVibe(): string {
  const pool = getPoolForTheme(config.theme ?? "");
  // Simple seeded rotation — shuffle by time so it feels random
  const idx = (randomIndex + Math.floor(Date.now() / 1000)) % pool.length;
  randomIndex++;
  return pool[idx];
}

// ═══════════════════════════════════════════════════════════════════════════
// File-Based Vibe Management
// ═══════════════════════════════════════════════════════════════════════════

function getVibesDir(): string {
  return join(process.env.HOME || process.env.USERPROFILE || homedir(), ".pi", "agent", "vibes");
}

function toVibeFileSlug(theme: string): string {
  return theme.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^[-_]+|[-_]+$/g, "") || "theme";
}

function getVibeFilePath(theme: string): string {
  return join(getVibesDir(), `${toVibeFileSlug(theme)}.txt`);
}

function loadVibesFromFile(theme: string): string[] {
  const filePath = getVibeFilePath(theme);
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, "utf-8").split("\n").map(l => l.trim()).filter(l => l.length > 0 && l.endsWith("..."));
  } catch {
    return [];
  }
}

function saveVibesToFile(theme: string, vibes: string[]): void {
  const vibesDir = getVibesDir();
  if (!existsSync(vibesDir)) mkdirSync(vibesDir, { recursive: true });
  writeFileSync(getVibeFilePath(theme), vibes.join("\n"));
}

function mulberry32(seed: number): () => number {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function getVibeAtIndex(vibes: string[], index: number, seed: number): string {
  if (vibes.length === 0) return `${config.fallback}...`;
  const effectiveIndex = index % vibes.length;
  const rng = mulberry32(seed);
  const indices = Array.from({ length: vibes.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return vibes[indices[effectiveIndex]];
}

function getNextFileVibe(): string {
  if (!config.theme) return `${config.fallback}...`;
  if (vibeCacheTheme !== config.theme) {
    vibeCache = loadVibesFromFile(config.theme);
    vibeCacheTheme = config.theme;
    vibeSeed = Date.now();
    vibeIndex = 0;
  }
  if (vibeCache.length === 0) return `${config.fallback}...`;
  const vibe = getVibeAtIndex(vibeCache, vibeIndex, vibeSeed);
  vibeIndex++;
  return vibe;
}

// ═══════════════════════════════════════════════════════════════════════════
// AI Generation (generate mode)
// ═══════════════════════════════════════════════════════════════════════════

function buildVibePrompt(ctx: VibeGenContext): string {
  const task = ctx.userPrompt.slice(0, 100);
  const exclude = recentVibes.length > 0 ? `Don't use: ${recentVibes.join(", ")}` : "";
  return config.promptTemplate
    .replace(/\{theme\}/g, ctx.theme)
    .replace(/\{task\}/g, task)
    .replace(/\{exclude\}/g, exclude);
}

function parseVibeResponse(response: string, fallback: string): string {
  if (!response) return `${fallback}...`;
  let vibe = response.trim().split("\n")[0].trim();
  vibe = vibe.replace(/^["']|["']$/g, "");
  if (!vibe.endsWith("...")) vibe = vibe.replace(/\.+$/, "") + "...";
  if (vibe.length > config.maxLength) vibe = vibe.slice(0, config.maxLength - 3) + "...";
  if (!vibe || vibe === "...") return `${fallback}...`;
  return vibe;
}

function buildAiContext(prompt: string): Context {
  return {
    systemPrompt: VIBE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
  };
}

async function generateVibe(ctx: VibeGenContext, signal: AbortSignal): Promise<string> {
  if (!extensionCtx) return `${config.fallback}...`;

  let model: ReturnType<typeof extensionCtx.modelRegistry.find> | undefined;
  const slashIndex = config.modelSpec.indexOf("/");
  if (slashIndex !== -1) {
    const provider = config.modelSpec.slice(0, slashIndex);
    const modelId = config.modelSpec.slice(slashIndex + 1);
    if (provider && modelId) model = extensionCtx.modelRegistry.find(provider, modelId);
  }
  if (!model && extensionCtx.model) model = extensionCtx.model;
  if (!model) return `${config.fallback}...`;

  const auth = await extensionCtx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) return `${config.fallback}...`;

  const response = await complete(model, buildAiContext(buildVibePrompt(ctx)), { apiKey: auth.apiKey, headers: auth.headers, signal });
  const textContent = response.content.find(c => c.type === "text");
  return parseVibeResponse(textContent?.text || "", config.fallback);
}

function trackRecentVibe(vibe: string): void {
  if (vibe === `${config.fallback}...`) return;
  recentVibes = [vibe, ...recentVibes.filter(v => v !== vibe)].slice(0, MAX_RECENT_VIBES);
}

async function generateAndUpdate(prompt: string, setWorkingMessage: (msg?: string) => void): Promise<void> {
  // Random mode: instant, no API call
  if (config.mode === "random") {
    setWorkingMessage(getNextRandomVibe());
    return;
  }

  // File mode: instant, no API call
  if (config.mode === "file") {
    setWorkingMessage(getNextFileVibe());
    return;
  }

  // Generate mode: API call with abort handling
  const controller = new AbortController();
  currentGeneration?.abort();
  currentGeneration = controller;

  const timeoutSignal = AbortSignal.timeout(config.timeout);
  const combinedSignal = AbortSignal.any([controller.signal, timeoutSignal]);

  try {
    const vibe = await generateVibe({ theme: config.theme!, userPrompt: prompt }, combinedSignal);
    if (isStreaming && !controller.signal.aborted && vibe !== `${config.fallback}...`) {
      trackRecentVibe(vibe);
      setWorkingMessage(vibe);
    }
  } catch {
    // Timeout or cancel — keep existing message
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Exported Functions (called from index.ts)
// ═══════════════════════════════════════════════════════════════════════════

export function initVibeManager(ctx: ExtensionContext): void {
  extensionCtx = ctx;
  config = loadConfig();
}

export function getVibeTheme(): string | null {
  return config.theme;
}

export function setVibeTheme(theme: string | null): boolean {
  config = { ...config, theme };
  recentVibes = [];
  randomIndex = 0;
  return saveConfig();
}

export function getVibeModel(): string {
  return config.modelSpec;
}

export function setVibeModel(modelSpec: string): boolean {
  config = { ...config, modelSpec };
  return saveModelConfig();
}

export function getVibeMode(): VibeMode {
  return config.mode;
}

export function setVibeMode(mode: VibeMode): boolean {
  config = { ...config, mode };
  return saveModeConfig();
}

export function onVibeBeforeAgentStart(
  prompt: string,
  setWorkingMessage: (msg?: string) => void,
): void {
  if (!config.theme || !extensionCtx) return;

  // Show first vibe immediately (random = instant, generate = placeholder then async)
  if (config.mode === "random") {
    setWorkingMessage(getNextRandomVibe());
  } else {
    setWorkingMessage(`Channeling ${config.theme}...`);
    generateAndUpdate(prompt, setWorkingMessage);
  }

  lastVibeTime = Date.now();
}

export function onVibeAgentStart(): void {
  isStreaming = true;
}

export function onVibeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  setWorkingMessage: (msg?: string) => void,
  agentContext?: string,
): void {
  if (!config.theme || !extensionCtx || !isStreaming) return;

  const now = Date.now();
  if (now - lastVibeTime < nextRefreshMs) return;

  let hint: string;
  if (agentContext && agentContext.length > 10) {
    hint = agentContext.slice(0, 150);
  } else {
    hint = `using ${toolName} tool`;
    if (toolName === "read" && toolInput.path) hint = `reading file: ${toolInput.path}`;
    else if (toolName === "write" && toolInput.path) hint = `writing file: ${toolInput.path}`;
    else if (toolName === "edit" && toolInput.path) hint = `editing file: ${toolInput.path}`;
    else if (toolName === "bash" && toolInput.command) hint = `running command: ${String(toolInput.command).slice(0, 40)}`;
  }

  lastVibeTime = now;
  nextRefreshMs = 4000 + Math.random() * 4000; // random 4-8s until next refresh
  generateAndUpdate(hint, setWorkingMessage);
}

export function onVibeAgentEnd(setWorkingMessage: (msg?: string) => void): void {
  isStreaming = false;
  currentGeneration?.abort();
  setWorkingMessage(undefined);
}

export function hasVibeFile(theme: string): boolean {
  return existsSync(getVibeFilePath(theme));
}

export function getVibeFileCount(theme: string): number {
  return loadVibesFromFile(theme).length;
}

export interface GenerateVibesResult {
  success: boolean;
  count: number;
  filePath: string;
  error?: string;
}

export async function generateVibesBatch(
  theme: string,
  count: number = 100,
): Promise<GenerateVibesResult> {
  const filePath = getVibeFilePath(theme);
  const safeCount = Number.isFinite(count) ? Math.min(Math.max(Math.floor(count), 1), 500) : 100;

  if (!extensionCtx) return { success: false, count: 0, filePath, error: "Extension not initialized" };

  const slashIndex = config.modelSpec.indexOf("/");
  if (slashIndex === -1) return { success: false, count: 0, filePath, error: "Invalid model spec" };
  const provider = config.modelSpec.slice(0, slashIndex);
  const modelId = config.modelSpec.slice(slashIndex + 1);

  const model = extensionCtx.modelRegistry.find(provider, modelId);
  if (!model) return { success: false, count: 0, filePath, error: `Model not found: ${config.modelSpec}` };

  const auth = await extensionCtx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) return { success: false, count: 0, filePath, error: auth.error };

  const prompt = BATCH_PROMPT.replace(/\{theme\}/g, theme).replace(/\{count\}/g, String(safeCount));
  const aiContext = buildAiContext(prompt);

  try {
    const signal = AbortSignal.timeout(30000);
    const response = await complete(model, aiContext, { apiKey: auth.apiKey, headers: auth.headers, signal });
    const textContent = response.content.find(c => c.type === "text");
    if (!textContent?.text) {
      return { success: false, count: 0, filePath, error: response.errorMessage || "Empty response" };
    }

    const vibes = textContent.text
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        let vibe = line.replace(/^["'\d.\-)\s]+/, "").trim().replace(/["']$/g, "");
        if (!vibe.endsWith("...")) vibe = vibe.replace(/\.+$/, "") + "...";
        return vibe;
      })
      .filter(vibe => vibe.length > 3 && vibe !== "...");

    if (vibes.length === 0) return { success: false, count: 0, filePath, error: "No valid vibes generated" };

    saveVibesToFile(theme, vibes);
    if (vibeCacheTheme === theme) { vibeCache = []; vibeCacheTheme = null; }

    return { success: true, count: vibes.length, filePath };
  } catch (error) {
    return { success: false, count: 0, filePath, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
