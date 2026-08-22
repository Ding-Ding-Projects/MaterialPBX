# Control-service connection

## Behavior

The web and Windows desktop interfaces connect to a MaterialPBX control service only after a real preflight succeeds. The documentation site never connects to or controls a PBX.

The preflight reads unauthenticated `GET /healthz`, then authenticated `GET /v1/system/status` and `GET /v1/system/capability-registry`. A live state requires all three responses to match their documented shapes. The interface then loads feature records from authenticated `GET /v1/resources?kind=<kind>` and sends an edited record with `PUT /v1/resources/<kind>/<id>`.

The current control-service contract does not expose a normal test-call validation action. The onboarding control therefore reports that exact gap, sends no destination, and never claims that a call or validation succeeded.

## Configuration

Enter an HTTPS control-service address and admin credential in **Connect a server**. Plain HTTP is accepted only for `localhost`, `127.0.0.1`, or `[::1]` development. The last successful endpoint is stored locally without a username, password, query, fragment, or other credential. The admin credential is held only by the current in-memory client, cleared from the form immediately, and discarded on disconnect or reload.

The capability registry is evidence, not authorization. Schema version 1 records capability identifiers, categories, installed/configured/running/unavailable/unknown states, reasons, warnings, generation time, and runtime or filesystem evidence. Resource access is labeled only after a real resource request succeeds or returns a permission refusal.

## Failure modes

- **Offline:** the endpoint did not answer within eight seconds or could not be reached. Check the address, certificate, service, network route, and firewall.
- **Permission needed:** HTTP 401 or 403 proves the service is reachable but the session-only admin credential lacks permission. Enter a permitted credential and retry.
- **Incompatible:** the API route is absent, the response is invalid or oversized, or required response fields are missing. Correct the endpoint or update the service.
- **Live with warnings:** health succeeded but the server reported a degraded state. Warnings remain visible and no capability is invented.
- **Read only:** a resource read succeeded and a later write returned a permission refusal. Editors stop sending changes for that feature until the next connection session.

Failed preflight and failed saves never create sample live records or success messages. Local drafts remain clearly labeled as local.

## Security and privacy

The renderer stores only the normalized non-secret endpoint. It does not persist credentials, authorization headers, response bodies, or PBX secrets in settings, history, exports, logs, or documentation. Authenticated requests send the session-only admin credential as an `Authorization: Bearer` header. Responses are limited to 2 MB, redirects are rejected, and requests use an eight-second deadline.

## Verification

This ultra-speed change compiled the web, documentation-site, and desktop-renderer bundles. It did not run tests, lint, type checking, security or accessibility suites, smoke checks, installer execution, or screenshots.

## Suggested articles

- [Guided onboarding](./onboarding.md)
- [Live operations](./observability.md)
- [Security](./security.md)
- [Landing and documentation site](./site.md)
