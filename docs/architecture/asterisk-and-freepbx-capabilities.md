# Asterisk 22 and FreePBX 17 capability map

MaterialPBX treats Asterisk as the real-time communications engine and FreePBX as the supported configuration and module lifecycle. The control plane exposes capabilities only when the required adapter and local component are available.

The capability registry preserves five distinct states: installed, configured, running, unavailable, and unknown. It attaches normalized evidence and a human-readable reason to each state. Probe failure degrades individual entries to unknown rather than silently converting missing data into false.

| Area | Control-plane model | Runtime boundary | Current limitation |
| --- | --- | --- | --- |
| Extensions, users, devices | Versioned desired resources | FreePBX bridge and reload | Resource-specific field compilation remains intentionally narrow. |
| Trunks and inbound/outbound routes | Versioned desired resources | FreePBX bridge and reload | Carrier templates, emergency routing, fraud policy, and jurisdiction rules require explicit implementation. |
| IVRs and queues | Versioned desired resources | FreePBX bridge; ARI can inspect live bridges | Live queue/member event ingestion is not persistent in version 1. |
| Conferences | Strict typed room resource | FreePBX 17 Conferences BMO owns `ext-meetme` and dynamic ConfBridge options | Configuration and reload do not prove a real call, recording, media, or participant-limit behavior. |
| Voicemail | Voicemail-box resources and event topic | FreePBX/Asterisk modules | Message content and audio are not returned by the generic API. |
| Recordings | Recording policy resources and read-only catalog | Files below the recording root | Playback/range streaming and retention execution are not included. |
| CDR and CEL | Bounded historical queries | Fixed MariaDB SQL | Availability depends on local schema and credentials. |
| Calendars and time conditions | Desired resources | FreePBX module integration | External calendar protocols are not implemented by this service. |
| Presence and BLF | Presence resources and event topic | ARI/AMI capability | Long-lived event subscription remains future work. |
| Parking | Parking-lot resources | FreePBX/Asterisk | Live slot state requires event ingestion. |
| Paging and intercom | Paging-group resources | FreePBX/Asterisk | Device auto-answer behavior is vendor-specific and must be explained per device. |
| Announcements | Announcement resources | FreePBX/Asterisk media | Media upload and transcoding are outside this lane. |
| Call files | Stored resource plus explicit submit endpoint | Atomic FreePBX bridge write to outgoing spool | Only allowlisted call-file keys are written. |
| Dynamic features | Desired resource | FreePBX bridge | Arbitrary dialplan applications are not accepted. |
| WebRTC | WebRTC-client resources and module report | PJSIP, HTTP WebSocket, ARI | Certificates, WSS publication, ICE/TURN, codecs, browser permissions, and media verification remain deployment duties. |
| STIR/SHAKEN | Capability observation | `res_stir_shaken.so` module probe | Loaded-module presence does not prove credentials, attestation authority, carrier acceptance, or legal compliance. |
| Backups | Start and status endpoints | Allowlisted `fwconsole backup` operations | Restore is deliberately absent until destructive confirmation and restore validation exist. |
| Federation | Explicit pairing, scoped encrypted envelopes | Control-plane cryptographic engine | SIP/PJSIP route materialization and live peer transport need multi-server verification. |

## Why capability reports include reasons

Feature-rich telephony often fails because a screen assumes that installed software, configured credentials, carrier support, and working media are the same state. They are not. A future UI should render `available`, evidence, missing requirement, and the exact next local action separately. Disabled controls should state the unmet condition rather than disappearing.

## Asterisk interfaces used

- AMI is used for bounded administrative call actions where Asterisk already defines a stable action protocol.
- ARI is used for allowlisted live resources such as channels, endpoints, and bridges.
- CDR and CEL remain database-backed historical data.
- FreePBX `fwconsole` remains the supported configuration/reload boundary.
- The privileged helper exists because the web process must not receive a general-purpose shell or Asterisk CLI.

No adapter accepts arbitrary executable text. Adding another Asterisk capability requires a schema, exact allowlisted operation, bounded timeout/output, audit behavior, failure semantics, and documentation before it is exposed.

The authenticated registry is available at `GET /v1/system/capability-registry`. Its evidence is deliberately summarized so credentials and raw configuration never cross the privileged-helper boundary.
