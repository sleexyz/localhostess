/**
 * Server discovery module
 * Finds running processes with LOCALHOST_NAME env var and their listening ports
 */

import { $ } from "bun";

interface Server {
  name: string;
  port: number;
  pid: number;
  command: string;
}

/**
 * Parse environment variables from `ps -Eww` output
 * Handles values with spaces by splitting on ` KEY=` pattern
 */
function parseEnvVars(raw: string): Record<string, string> {
  const vars: Record<string, string> = {};
  // Split on space followed by KEY= pattern
  const parts = raw.split(/\s(?=[a-zA-Z_][a-zA-Z0-9_]*=)/);
  for (const part of parts) {
    const eqIndex = part.indexOf("=");
    if (eqIndex > 0) {
      const key = part.slice(0, eqIndex);
      const value = part.slice(eqIndex + 1);
      vars[key] = value;
    }
  }
  return vars;
}

/**
 * Get environment variables for a process
 */
async function getProcessEnv(pid: number): Promise<Record<string, string>> {
  try {
    const result = await $`ps -Eww -p ${pid} -o command=`.text();
    return parseEnvVars(result);
  } catch {
    return {};
  }
}

/**
 * Get command line for a process
 */
async function getProcessCommand(pid: number): Promise<string> {
  try {
    const result = await $`ps -p ${pid} -o command=`.text();
    return result.trim();
  } catch {
    return "";
  }
}

/**
 * Find all TCP servers listening on localhost
 * Returns map of PID -> ports
 */
async function findListeningPorts(): Promise<Map<number, number[]>> {
  const pidPorts = new Map<number, number[]>();

  try {
    const result = await $`lsof -i -P -n`.text();
    const lines = result.split("\n");

    for (const line of lines) {
      if (!line.includes("LISTEN")) continue;

      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;

      const pid = parseInt(parts[1], 10);
      const addrPort = parts[8]; // e.g., "*:3000" or "[::1]:5173"
      const portMatch = addrPort.match(/:(\d+)$/);

      if (portMatch) {
        const port = parseInt(portMatch[1], 10);
        const existing = pidPorts.get(pid) || [];
        if (!existing.includes(port)) {
          existing.push(port);
          pidPorts.set(pid, existing);
        }
      }
    }
  } catch (e) {
    console.error("Failed to run lsof:", e);
  }

  return pidPorts;
}

const DEBUG_PORTS = new Set([9229, 9222, 5858]);
const EPHEMERAL_PORT_MIN = 49152;

/**
 * Pick the best port from a list of candidates.
 * Filter pipeline: remove debug ports, remove ephemeral ports, take lowest.
 * Fallback: lowest from the original set.
 */
function pickPort(ports: number[]): number {
  const filtered = ports
    .filter((p) => !DEBUG_PORTS.has(p) && p < EPHEMERAL_PORT_MIN);
  if (filtered.length > 0) return Math.min(...filtered);
  return Math.min(...ports);
}

/**
 * Scan for servers with LOCALHOST_NAME env var
 */
export async function scanServers(): Promise<Server[]> {
  const pidPorts = await findListeningPorts();

  const DEBUG = process.env.DEBUG === "1";
  if (DEBUG) console.log(`[scan] Found ${pidPorts.size} processes with listening ports`);

  // First pass: collect entries grouped by NAME
  const byName = new Map<string, { pid: number; ports: number[]; command: string }[]>();

  for (const [pid, ports] of pidPorts) {
    const env = await getProcessEnv(pid);
    const name = env["NAME"];

    if (DEBUG) {
      const hasVhost = name ? `NAME=${name}` : "no NAME";
      console.log(`[scan] PID ${pid} ports=${ports.join(",")} ${hasVhost}`);
    }

    if (name) {
      const command = await getProcessCommand(pid);
      const entries = byName.get(name) || [];
      entries.push({ pid, ports, command: command.slice(0, 80) });
      byName.set(name, entries);
    }
  }

  // Second pass: pick one port per name
  const servers: Server[] = [];
  for (const [name, entries] of byName) {
    const allPorts = entries.flatMap((e) => e.ports);
    const chosenPort = pickPort(allPorts);
    // Use the pid/command of whichever entry owns the chosen port
    const owner = entries.find((e) => e.ports.includes(chosenPort)) || entries[0];
    servers.push({ name, port: chosenPort, pid: owner.pid, command: owner.command });
  }

  return servers;
}

/**
 * Build subdomain -> port mapping
 */
export async function buildMapping(): Promise<Map<string, number>> {
  const servers = await scanServers();
  const mapping = new Map<string, number>();
  for (const server of servers) {
    mapping.set(server.name, server.port);
  }
  return mapping;
}

// CLI: run directly to test scanning
if (import.meta.main) {
  console.log("Scanning for servers with NAME...\n");

  const servers = await scanServers();

  if (servers.length === 0) {
    console.log("No servers found with NAME env var.");
    console.log("\nTry starting a server with:");
    console.log('  NAME=test bun -e "Bun.serve({port: 4567, fetch: () => new Response(\'hello\')})"');
  } else {
    console.log("Found servers:\n");
    for (const server of servers) {
      console.log(`┌─────────────────────────────────────────`);
      console.log(`│ ${server.name}.localhost:9999 → :${server.port}`);
      console.log(`├─────────────────────────────────────────`);
      console.log(`│ PID:     ${server.pid}`);
      console.log(`│ Command: ${server.command}...`);
      console.log(`└─────────────────────────────────────────\n`);
    }
  }
}
