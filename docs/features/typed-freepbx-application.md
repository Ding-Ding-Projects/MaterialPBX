# Typed FreePBX application

## Behavior

MaterialPBX applies extensions, PJSIP trunks, inbound routes, outbound routes, IVRs, queues, ring groups, voicemail boxes, and time conditions through feature-specific bounded schemas. A desired resource is always saved first. Live application occurs only when the resource maps to a registered feature adapter and its complete normalized payload validates.

Each supported application returns a plan with ordered validation, synchronization, and reload steps; validation evidence; applied and reloaded states; partial-failure state; and an exact warning. An unsupported kind or invalid configuration returns `unsupported` and does not call FreePBX. Saving a draft is never reported as a live PBX mutation.

## Configuration boundaries

The schemas accept structured identifiers, number patterns, destinations, strategies, members, time windows, and bounded scalar settings. They reject unexpected fields. Trunks support PJSIP only and refer to credentials by an opaque credential identifier; secret values never enter the resource payload. Routes accept bounded dial-pattern syntax but never raw dialplan applications or executable configuration fragments.

The helper exposes fixed `freepbx.application.apply` and `freepbx.application.remove` actions. It revalidates the normalized payload, maps the feature through a fixed registry, and invokes only the MaterialPBX FreePBX bridge command with validated kind and identifier arguments. It does not invoke a shell.

## Failure modes

- Schema failure: the plan is unsupported, no helper action runs, and validation evidence describes the rejected shape.
- Bridge failure: `applied=false`, `reloaded=false`; the desired resource remains stored.
- Reload failure after synchronization: `applied=true`, `reloaded=false`, `partialFailure=true`; callers must not claim the running PBX matches the desired state.
- Unsupported feature: the draft remains stored and the exact unsupported reason is returned.
- Helper unavailable: live mutation fails without a raw-command fallback.

## Security and limitations

Typed validation prevents arbitrary shell, raw dialplan, and configuration injection at this boundary. It does not by itself prove that the FreePBX bridge compiled every resource into native module tables or that a carrier accepts a trunk or route. Emergency routing, premium-rate controls, credentials, TLS certificates, external announcements, and jurisdiction-specific behavior need separate reviewed adapters.

The accelerated implementation pass built the affected packages but ran no live FreePBX, call, reload, partial-failure, security, or integration verification. Until the bridge implements feature-specific native FreePBX table writes and those flows are verified, a supported plan proves bounded input and command routing, not successful telephony behavior.
