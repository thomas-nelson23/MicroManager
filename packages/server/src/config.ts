/** Server configuration, all from environment variables (see README for the full list). */
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;

function chooseProvider(): "claude" | "hermes" {
  const p = (env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (p === "hermes" || p === "openai") return "hermes";
  if (p === "claude") return "claude";
  const hasClaude = !!(env.CLAUDE_CODE_OAUTH_TOKEN || env.ANTHROPIC_API_KEY);
  const hasHermes = !!(env.HERMES_API_KEY || env.HERMES_BASE_URL || env.OPENROUTER_API_KEY);
  return hasHermes && !hasClaude ? "hermes" : "claude";
}

export const config = {
  port: Number(env.PORT ?? 8765),
  host: env.HOST ?? "0.0.0.0",
  /** Projects live in <dataDir>/projects/<id>/. */
  dataDir: path.resolve(env.DATA_DIR ?? path.join(here, "..", "..", "..", "data")),
  /** Built web UI to serve (production). Unset in development, where Vite serves it. */
  webDist: env.WEB_DIST ? path.resolve(env.WEB_DIST) : undefined,
  serverRoot: path.resolve(here, ".."),

  /** The app's HTTPS address, if it has one: shown to people who open it over plain HTTP, where browsers block USB. */
  publicUrl: env.PUBLIC_URL ?? "",

  /** Model for everyday chat turns. */
  chatModel: env.CLAUDE_CHAT_MODEL ?? "claude-sonnet-5-5",
  /** Model for a message sent with "Think harder" (CLAUDE_MODEL kept its old name so existing setups keep working). */
  strongModel: env.CLAUDE_MODEL ?? "claude-opus-5-5",
  /** Start a fresh Claude conversation after this many idle minutes, or once the context passes CHAT_MAX_CONTEXT tokens. */
  freshAfterMinutes: Number(env.CHAT_FRESH_AFTER_MIN ?? 120),
  maxContextTokens: Number(env.CHAT_MAX_CONTEXT ?? 60000),
  /** Reasoning effort for the chat: low, medium, high, xhigh or max. */
  claudeEffort: (env.CLAUDE_EFFORT ?? "medium") as "low" | "medium" | "high" | "xhigh" | "max",
  /** Let Claude run shell commands inside the project folder (sensible inside the container only). */
  allowBash: env.ALLOW_BASH === "1",

  /**
   * Which AI runs the chat: "claude" (Claude Agent SDK, the default) or "hermes" (a Hermes model from Nous Research,
   * or any model, through an OpenAI-compatible API such as OpenRouter, Nous Portal, Ollama or LM Studio).
   * Unset: Hermes when only Hermes settings are given, Claude otherwise.
   */
  provider: chooseProvider(),
  /** The name the app and the chat use for the assistant. */
  get assistantName(): string {
    return this.provider === "hermes" ? (env.HERMES_NAME ?? "Hermes") : "Claude";
  },
  hermes: {
    /** Base URL of the OpenAI-compatible API, up to and including /v1. */
    baseUrl: (env.HERMES_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
    /** Not needed for a local server such as Ollama. */
    apiKey: env.HERMES_API_KEY ?? env.OPENROUTER_API_KEY ?? "",
    /** Model for everyday chat turns (the name the API uses, e.g. "nousresearch/hermes-4-70b" on OpenRouter, "hermes3" on Ollama). */
    model: env.HERMES_MODEL ?? "nousresearch/hermes-4-70b",
    /** Model for a message sent with "Think harder". */
    strongModel: env.HERMES_STRONG_MODEL ?? env.HERMES_MODEL ?? "nousresearch/hermes-4-405b",
    /** Longest wait for one model reply, in seconds (local models on a CPU can be slow). */
    timeout: Number(env.HERMES_TIMEOUT ?? 300),
  },

  arduinoCli: env.ARDUINO_CLI ?? "arduino-cli",

  vm: {
    host: env.VM_HOST ?? "",
    user: env.VM_USER ?? "",
    jobRoot: env.VM_JOBROOT ?? "",
    editor: env.VM_EDITOR ?? "C:\\Program Files (x86)\\Nextion Editor\\Nextion Editor.exe",
    buildTimeout: Number(env.BUILD_TIMEOUT ?? 150),
    sshKey: env.SSH_KEY,
  },

  defaults: {
    board: { fqbn: env.DEFAULT_FQBN ?? "arduino:megaavr:nona4809", name: env.DEFAULT_BOARD_NAME ?? "Arduino Nano Every" },
    display: {
      series: env.DISPLAY_SERIES ?? "Intelligent",
      model: env.DISPLAY_MODEL ?? "NX4827P043_011",
      width: Number(env.DISPLAY_WIDTH ?? 480),
      height: Number(env.DISPLAY_HEIGHT ?? 272),
    },
  },
};

export const projectsDir = () => path.join(config.dataDir, "projects");
