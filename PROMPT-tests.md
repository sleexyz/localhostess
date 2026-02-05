# Session: tests

## Goal

Integration test suite for localhostess covering the full proxy matrix: reverse proxy + forward proxy, HTTP + WebSocket. Tests should spawn real processes and make real TCP connections — no mocking.

## Success Criteria

`bun test` passes, covering all 4 quadrants of the proxy matrix plus edge cases. Tests are reliable (no flaky port conflicts, no leaked processes).

## Tasks

- [ ] Create a test backend (`src/test-backend.ts`) that handles both HTTP and WebSocket
  - HTTP: respond with JSON `{ name, path, headers: { host } }` so tests can verify routing and header rewriting
  - WebSocket: echo frames back to the client
  - Accept `PORT=0` for random port assignment
  - Print `LISTENING:${port}` to stdout so the test harness can discover the actual port

- [ ] Create the integration test file (`src/index.test.ts`)
  - `beforeAll`: spawn localhostess (`PORT=0`) and test backend (`NAME=testapp PORT=0`), parse their ports from stdout, wait for ready
  - `afterAll`: kill both processes
  - Use raw TCP sockets (`net.connect`) for all tests — no HTTP or WebSocket libraries needed

- [ ] Test: reverse proxy HTTP
  - Connect to `localhost:${daemonPort}`, send `GET / HTTP/1.1\r\nHost: testapp.localhost:${daemonPort}\r\n\r\n`
  - Assert: 200, response body contains `"name":"testapp"`

- [ ] Test: reverse proxy WebSocket
  - Connect to `localhost:${daemonPort}`, send WebSocket upgrade with `Host: testapp.localhost:${daemonPort}`
  - Assert: 101 Switching Protocols
  - Send a WebSocket text frame, assert echo comes back

- [ ] Test: forward proxy HTTP
  - Connect to `localhost:${daemonPort}`, send `GET http://testapp/ HTTP/1.1\r\nHost: testapp\r\n\r\n`
  - Assert: 200, response body contains `"name":"testapp"`
  - Assert: `headers.host` is `localhost:${backendPort}` (Host rewriting works)

- [ ] Test: forward proxy CONNECT tunnel
  - Connect to `localhost:${daemonPort}`, send `CONNECT testapp:80 HTTP/1.1\r\n\r\n`
  - Assert: `200 Connection Established`
  - Then send `GET / HTTP/1.1\r\nHost: testapp\r\n\r\n` through the tunnel
  - Assert: 200, reaches backend

- [ ] Test: unknown service returns 404 (reverse proxy)
  - Send request with `Host: nonexistent.localhost:${daemonPort}`
  - Assert: 404

- [ ] Test: unknown service closes connection (forward proxy)
  - Send `GET http://nonexistent/ HTTP/1.1\r\n\r\n`
  - Assert: connection closed with no response

- [ ] Test: unknown service closes connection (CONNECT)
  - Send `CONNECT nonexistent:80 HTTP/1.1\r\n\r\n`
  - Assert: connection closed with no response

- [ ] Test: dashboard serves HTML at `localhost:${daemonPort}`
  - Send `GET / HTTP/1.1\r\nHost: localhost:${daemonPort}\r\n\r\n`
  - Assert: 200, body contains `localhostess`

- [ ] Test: PAC file serves valid JS at `/proxy.pac`
  - Send `GET /proxy.pac HTTP/1.1\r\nHost: localhost:${daemonPort}\r\n\r\n`
  - Assert: 200, content-type is `application/x-ns-proxy-autoconfig`, body contains `FindProxyForURL`

## Predictions

- [ ] Bun's test runner can spawn child processes in beforeAll and reliably kill them in afterAll [guess]
- [ ] WebSocket frame encoding/decoding by hand (for echo test) will be the trickiest part — need to handle masking and framing correctly [guess]
- [ ] The localhostess mapping cache (5s TTL) may cause a race — the test backend might not be discovered on the first request. May need a retry or a startup probe. [GOALS — mapping is lazy + cached]

## Codebase Context

> Prefer retrieval-led reasoning over pretraining-led reasoning.

**Facts:** daemon-port:default 9090, configurable via PORT env|test-runner:bun test, wired via `just test`|test-backend-exists:src/test-server.ts exists but HTTP-only, no WS|tcp-proxy:WebSocket handled at TCP level (Bun.listen/Bun.connect), HTTP via fetch|forward-proxy:detects absolute URI in request line, rewrites Host header to localhost:targetPort|connect-tunnel:CONNECT method establishes bidirectional TCP pipe, responds 200 Connection Established|unknown-forward:unknown services get TCP close (no response) for PAC DIRECT fallback|mapping-cache:5s TTL, lazy scan via lsof+ps
