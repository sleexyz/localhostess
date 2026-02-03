/**
 * Simple test server - run with VHOST to test routing
 *
 * Usage:
 *   VHOST=test bun run src/test-server.ts
 *   VHOST=test PORT=4567 bun run src/test-server.ts
 */

const PORT = parseInt(process.env.PORT || "4567", 10);
const NAME = process.env.VHOST || "unnamed";

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    return new Response(`Hello from "${NAME}" server!\nPath: ${url.pathname}\nPort: ${PORT}\n`);
  },
});

console.log(`Test server "${NAME}" running on http://localhost:${PORT}`);
console.log(`Access via: http://${NAME}.localhost:9999`);
