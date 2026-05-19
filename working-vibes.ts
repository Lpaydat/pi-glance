// working-vibes.ts
// Themed working messages with built-in phrase pools + optional file loading.

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ═══════════════════════════════════════════════════════════════════════════
// Built-in Phrase Pools
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
// State
// ═══════════════════════════════════════════════════════════════════════════

let config: { theme: string | null; fallback: string } = { theme: null, fallback: "Working" };
let extensionCtx: ExtensionContext | null = null;
let isStreaming = false;
let lastVibeTime = 0;
let nextRefreshMs = 4000 + Math.random() * 4000;
let randomIndex = 0;

// File cache
let vibeFileCache: string[] = [];
let vibeFileCacheTheme: string | null = null;

// ═══════════════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════════════

function getSettingsPath(): string {
  return join(process.env.HOME || process.env.USERPROFILE || homedir(), ".pi", "agent", "settings.json");
}

function readSettings(): Record<string, unknown> {
  try {
    if (!existsSync(getSettingsPath())) return {};
    const parsed = JSON.parse(readFileSync(getSettingsPath(), "utf-8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function loadConfig(): void {
  const settings = readSettings();
  const rawTheme = typeof settings.workingVibe === "string" ? settings.workingVibe : null;
  config.theme = rawTheme?.toLowerCase() === "off" ? null : rawTheme;
  config.fallback = typeof settings.workingVibeFallback === "string" ? settings.workingVibeFallback : "Working";
}

// ═══════════════════════════════════════════════════════════════════════════
// Phrase Pool
// ═══════════════════════════════════════════════════════════════════════════

function getPoolForTheme(theme: string): string[] {
  const key = theme.toLowerCase().trim();
  const builtins = BUILTIN_VIBES[key];
  if (builtins) return [...builtins, ...loadFileVibes(key)];

  // Partial match
  for (const [k, v] of Object.entries(BUILTIN_VIBES)) {
    if (key.includes(k) || k.includes(key)) return [...v, ...loadFileVibes(k)];
  }

  // Unknown theme — check for file first, then generic
  const fileVibes = loadFileVibes(key);
  return fileVibes.length > 0 ? fileVibes : GENERIC_VIBES;
}

function loadFileVibes(theme: string): string[] {
  if (vibeFileCacheTheme === theme) return vibeFileCache;
  const filePath = getVibeFilePath(theme);
  if (!existsSync(filePath)) { vibeFileCache = []; vibeFileCacheTheme = theme; return []; }
  try {
    vibeFileCache = readFileSync(filePath, "utf-8").split("\n").map(l => l.trim()).filter(l => l.length > 0);
    vibeFileCacheTheme = theme;
    return vibeFileCache;
  } catch {
    vibeFileCache = [];
    vibeFileCacheTheme = theme;
    return [];
  }
}

function getVibeFilePath(theme: string): string {
  const slug = theme.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^[-_]+|[-_]+$/g, "") || "theme";
  return join(process.env.HOME || process.env.USERPROFILE || homedir(), ".pi", "agent", "vibes", `${slug}.txt`);
}

function getNextVibe(): string {
  const pool = getPoolForTheme(config.theme ?? "");
  if (pool.length === 0) return `${config.fallback}...`;
  const idx = (randomIndex + Math.floor(Date.now() / 1000)) % pool.length;
  randomIndex++;
  return pool[idx];
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

export function initVibeManager(ctx: ExtensionContext): void {
  extensionCtx = ctx;
  loadConfig();
}

export function getVibeTheme(): string | null {
  return config.theme;
}

export function setVibeTheme(theme: string | null): boolean {
  config.theme = theme;
  randomIndex = 0;
  vibeFileCacheTheme = null; // reset file cache
  // Save to settings.json
  const settings = readSettings();
  if (theme === null) {
    delete settings.workingVibe;
  } else {
    settings.workingVibe = theme;
  }
  const { writeFileSync: wfs, mkdirSync } = require("node:fs");
  const { dirname } = require("node:path");
  try {
    mkdirSync(dirname(getSettingsPath()), { recursive: true });
    wfs(getSettingsPath(), JSON.stringify(settings, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

export function hasVibeFile(theme: string): boolean {
  return existsSync(getVibeFilePath(theme));
}

export function getVibeFileCount(theme: string): number {
  return loadFileVibes(theme).length;
}

export function onVibeBeforeAgentStart(
  _prompt: string,
  setWorkingMessage: (msg?: string) => void,
): void {
  if (!config.theme || !extensionCtx) return;
  setWorkingMessage(getNextVibe());
  lastVibeTime = Date.now();
}

export function onVibeAgentStart(): void {
  isStreaming = true;
}

export function onVibeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  setWorkingMessage: (msg?: string) => void,
): void {
  if (!config.theme || !extensionCtx || !isStreaming) return;

  const now = Date.now();
  if (now - lastVibeTime < nextRefreshMs) return;

  lastVibeTime = now;
  nextRefreshMs = 4000 + Math.random() * 4000;
  setWorkingMessage(getNextVibe());
}

export function onVibeAgentEnd(setWorkingMessage: (msg?: string) => void): void {
  isStreaming = false;
  setWorkingMessage(undefined);
}
