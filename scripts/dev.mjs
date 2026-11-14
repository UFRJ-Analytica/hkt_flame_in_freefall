import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiPort = Number(process.env.HABITATFIRE_API_PORT || process.env.PORT || 8000);
const webPort = Number(process.env.HABITATFIRE_WEB_PORT || 5173);
const apiOnly = process.argv.includes("--api-only");
const venvPython = resolve(root, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
const python = process.env.HABITATFIRE_PYTHON || (existsSync(venvPython) ? venvPython : process.platform === "win32" ? "python.exe" : "python3");
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
  process.exitCode = code;
}

function launch(command, args, env = process.env) {
  const child = spawn(command, args, { cwd: root, env, stdio: "inherit", shell: false });
  children.push(child);
  child.on("error", (error) => {
    console.error(`[HabitatFire] Cannot start ${command}: ${error.message}`);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      if (code !== 0) console.error(`[HabitatFire] Process stopped (${code ?? signal}). No existing user services were terminated.`);
      stop(code ?? 1);
    }
  });
  return child;
}

function apiReady() {
  return new Promise((done) => {
    const req = request({ host: "127.0.0.1", port: apiPort, path: "/api/health", timeout: 800 }, (res) => {
      res.resume();
      done(res.statusCode === 200);
    });
    req.on("timeout", () => { req.destroy(); done(false); });
    req.on("error", () => done(false));
    req.end();
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

if (!Number.isInteger(apiPort) || !Number.isInteger(webPort) || apiPort < 1 || apiPort > 65535 || webPort < 1 || webPort > 65535 || (!apiOnly && webPort === apiPort)) {
  console.error("[HabitatFire] Configure distinct valid HABITATFIRE_API_PORT and HABITATFIRE_WEB_PORT values.");
  process.exitCode = 1;
} else if (!existsSync(resolve(root, "backend/server.py"))) {
  console.error("[HabitatFire] Missing backend/server.py. Run this command from the complete project checkout.");
  process.exitCode = 1;
} else {
  const api = launch(python, ["-u", "-m", "backend.server"], { ...process.env, HOST: process.env.HOST || "127.0.0.1", PORT: String(apiPort), PYTHONUNBUFFERED: "1" });
  if (!apiOnly) {
    let ready = false;
    for (let attempt = 0; attempt < 50 && api.exitCode === null && !stopping; attempt++) {
      if (await apiReady()) { ready = true; break; }
      await new Promise((done) => setTimeout(done, 200));
    }
    const vite = resolve(root, "node_modules/vite/bin/vite.js");
    if (!ready || stopping) {
      if (!stopping) console.error("[HabitatFire] Research API did not become ready; inspect the Python error above.");
      stop(1);
    } else if (!existsSync(vite)) {
      console.error("[HabitatFire] Vite is missing. Run npm install first.");
      stop(1);
    } else {
      console.log(`[HabitatFire] Research API: http://127.0.0.1:${apiPort}; workspace: http://127.0.0.1:${webPort}`);
      launch(process.execPath, [vite, "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], { ...process.env, HABITATFIRE_API_PORT: String(apiPort) });
    }
  }
}
