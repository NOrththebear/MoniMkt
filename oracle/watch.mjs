import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.dirname(fileURLToPath(import.meta.url));
const keeper = path.join(site, "keeper.mjs");
const intervalMs = Number(process.env.ORACLE_INTERVAL_MS || 10 * 60 * 1000);

let running = false;

function runKeeper() {
  if (running) {
    console.log(`[oracle-watch] previous run is still active, skipping ${new Date().toISOString()}`);
    return;
  }
  running = true;
  console.log(`[oracle-watch] publishing at ${new Date().toISOString()}`);
  const child = spawn(process.execPath, [keeper, "--send"], {
    cwd: site,
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    running = false;
    console.log(`[oracle-watch] keeper exited with ${code} at ${new Date().toISOString()}`);
  });
  child.on("error", (error) => {
    running = false;
    console.error("[oracle-watch] keeper failed to start:", error);
  });
}

runKeeper();
setInterval(runKeeper, intervalMs);
