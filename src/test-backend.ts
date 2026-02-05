/**
 * Test backend for integration tests.
 * Handles HTTP (returns JSON with name/path/headers) and WebSocket (echo).
 * Supports PORT=0 for random port assignment.
 * Prints LISTENING:${port} to stdout for the test harness.
 */

const PORT = parseInt(process.env.PORT || "0", 10);
const NAME = process.env.NAME || "testapp";

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    if (server.upgrade(req)) return undefined;
    const url = new URL(req.url);
    return Response.json({
      name: NAME,
      path: url.pathname,
      headers: { host: req.headers.get("host") },
    });
  },
  websocket: {
    message(ws, message) {
      ws.send(message);
    },
  },
});

console.log(`LISTENING:${server.port}`);
