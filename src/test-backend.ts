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
    const upgradeData = { host: req.headers.get("host"), origin: req.headers.get("origin") };
    if (server.upgrade(req, { data: upgradeData })) return undefined;
    const url = new URL(req.url);
    // /gzipped — return gzip-compressed JSON with Content-Encoding header
    if (url.pathname === "/gzipped") {
      const json = JSON.stringify({ compressed: true, name: NAME });
      const body = Bun.gzipSync(Buffer.from(json));
      return new Response(body, {
        headers: { "content-type": "application/json", "content-encoding": "gzip" },
      });
    }
    // /big?n=<bytes> — return a known repeating pattern of that size
    if (url.pathname === "/big") {
      const n = parseInt(url.searchParams.get("n") || "262144", 10);
      const chunk = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\n";
      const body = chunk.repeat(Math.ceil(n / chunk.length)).slice(0, n);
      return new Response(body, {
        headers: { "content-type": "text/plain" },
      });
    }
    return Response.json({
      name: NAME,
      path: url.pathname,
      headers: { host: req.headers.get("host"), origin: req.headers.get("origin") },
    });
  },
  websocket: {
    message(ws, message) {
      if (message === "HEADERS") {
        ws.send(JSON.stringify(ws.data));
        return;
      }
      ws.send(message);
    },
  },
});

console.log(`LISTENING:${server.port}`);
