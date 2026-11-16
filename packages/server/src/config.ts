/** Server configuration, all from environment variables (see README for the full list). */
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8765),
  host: env.HOST ?? "0.0.0.0",
  /** Projects live in <dataDir>/projects/<id>/. */
  dataDir: path.resolve(env.DATA_DIR ?? path.join(here, "..", "..", "..", "data")),
  /** Built web UI to serve (production). Unset in development, where Vite serves it. */
  webDist: env.WEB_DIST ? path.resolve(env.WEB_DIST) : undefined,
  serverRoot: path.resolve(here, ".."),

  claudeModel: env.CLAUDE_MODEL ?? "claude-opus-5-5",
  /** Reasoning effort for the chat: low, medium, high, xhigh or max. */
  claudeEffort: (env.CLAUDE_EFFORT ?? "medium") as "low" | "medium" | "high" | "xhigh" | "max",
  /** Let Claude run shell commands inside the project folder (sensible inside the container only). */
  allowBash: env.ALLOW_BASH === "1",

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
