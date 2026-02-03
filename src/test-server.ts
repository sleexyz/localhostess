/**
 * Simple test server - run with NAME to test routing
 *
 * Usage:
 *   NAME=test bun run src/test-server.ts
 *   NAME=test PORT=4567 bun run src/test-server.ts
 */

const PORT = parseInt(process.env.PORT || "4567", 10);
const NAME = process.env.NAME || "unnamed";

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    return new Response(`Hello from "${NAME}" server!\nPath: ${url.pathname}\nPort: ${PORT}\n`);
  },
});

console.log(`Test server "${NAME}" running on http://localhost:${PORT}`);
console.log(`Access via: http://${NAME}.localhost:9999`);
