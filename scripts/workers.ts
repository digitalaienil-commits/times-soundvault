import { spawn, type ChildProcess } from "node:child_process";

/**
 * Runs the continuous background workers in one terminal for local development.
 *
 * Analysis, playback derivatives and embeddings are durable queues: without a
 * worker a submission stays queued and no technical or AI results ever appear.
 * Production supervises each as its own process; this is the developer-machine
 * equivalent.
 *
 * The copyright worker is deliberately absent. Manual-mode Content ID batches
 * are operator-initiated from the Copyright workspace, so the worker has
 * nothing to do until someone asks for a batch. Run `pnpm copyright:worker`
 * alongside this when working on that flow.
 */
const WORKERS = [
  ["processing", "scripts/processing-worker.ts"],
  ["media", "scripts/media-worker.ts"],
  ["embedding", "scripts/embedding-worker.ts"],
] as const;

const children = new Map<string, ChildProcess>();
let shuttingDown = false;

function prefix(name: string, chunk: Buffer) {
  for (const line of chunk.toString().split("\n")) {
    if (line.trim()) console.log(`[${name}] ${line}`);
  }
}

function start(name: string, script: string) {
  const child = spawn(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", script],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout?.on("data", (chunk: Buffer) => prefix(name, chunk));
  child.stderr?.on("data", (chunk: Buffer) => prefix(name, chunk));
  child.on("exit", (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;
    console.error(
      `[${name}] exited unexpectedly (code ${code ?? "none"}, signal ${signal ?? "none"}). Stopping the remaining workers.`,
    );
    process.exitCode = 1;
    shutdown("SIGTERM");
  });
  children.set(name, child);
  console.log(`[${name}] started`);
}

/** Lets each worker finish its current leased job instead of killing it. */
function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(
    "Stopping workers. In-flight jobs finish or return to the queue.",
  );
  for (const [name, child] of children) {
    console.log(`[${name}] stopping`);
    child.kill(signal);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

if (process.env.NODE_ENV === "production") {
  console.error(
    "Run each worker as its own supervised process in production. See docs/deployment-runbook.md.",
  );
  process.exitCode = 1;
} else {
  for (const [name, script] of WORKERS) start(name, script);
}
