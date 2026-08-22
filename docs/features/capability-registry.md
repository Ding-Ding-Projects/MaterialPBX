# Capability registry

## Behavior

`GET /v1/system/capability-registry` returns evidence-backed Asterisk 22 and FreePBX 17 capabilities. Every record has a stable identifier, category, state, reason, and bounded evidence list. States mean:

- `installed`: required module files were found, but runtime or configuration evidence was not observed;
- `configured`: required runtime components are loaded and Asterisk reported configured objects or an enabled interface;
- `running`: the platform or every required module answered as loaded;
- `unavailable`: both runtime and readable module-directory evidence show a required component is absent;
- `unknown`: one or more probes failed, so missing evidence is not treated as absence.

Installed never means configured, and configured never means that a carrier, certificate, browser, endpoint, media path, or call has been verified.

## Coverage and evidence

The bounded helper probes FreePBX and Asterisk versions, loaded modules, installed module files, PJSIP transports, endpoints and outbound registrations, AMI settings, and ARI status. The registry covers core dialing, recording, CDR, CEL, queues, conferences, parking, paging, voicemail, WebRTC, ARI external media support, STIR/SHAKEN, geolocation, DAHDI, and IAX2 where those probes provide evidence.

Evidence contains the probe source, observation time, summary, exit status, byte count, and module names. It does not contain credentials, raw configuration, SIP secrets, database values, dialplan, full command output, or host paths.

## Failure modes

Each probe has a fixed executable, exact argument list, timeout, and output limit. A failed probe adds a warning and produces `unknown` where the remaining evidence cannot decide the state. Other successful probes remain useful; one unavailable interface does not erase the whole registry. The helper never invokes a shell or accepts a caller-supplied command.

If the privileged helper itself is unavailable, the authenticated API request fails rather than returning an invented empty registry. Callers should retain the last explicitly timestamped result, label it stale, and show the helper recovery action.

## Security and privacy

The endpoint requires the administrator bearer credential. Only normalized facts leave the privileged boundary. Capability presence is operationally sensitive because it describes the PBX attack surface; do not expose the endpoint publicly or include responses in ordinary support bundles without review.

## Platform and container limits

The installed-module probe currently reads `/usr/lib/asterisk/modules`, the standard path in the supplied Debian 12 amd64 system container. Asterisk installations using another module directory will report unknown installed state unless runtime evidence is sufficient. DAHDI module presence does not prove host kernel drivers, devices, timing, permissions, or working calls. WebRTC presence does not prove HTTPS/WSS, ICE/TURN, codecs, certificates, or browser permissions. STIR/SHAKEN presence does not prove certificate authority, attestation policy, carrier acceptance, or legal authority. External-media presence reports the ARI channels provider only; it does not prove an external media session was established.

## Verification state

The affected package builds completed during the accelerated implementation pass. No unit, integration, live-PBX, container, call, media, security, accessibility, smoke, or capture verification ran. Live Asterisk 22 and FreePBX 17 fixtures must verify output variations and object counts before this registry is treated as production evidence.
