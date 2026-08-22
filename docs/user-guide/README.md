# MaterialPBX user guide

MaterialPBX is a visual control surface for FreePBX and Asterisk. Start with [guided onboarding](../features/onboarding.md), then connect [phones and devices](../features/devices.md), a [phone-company connection](../features/trunks.md), and [incoming](../features/inbound-routes.md) plus [outgoing](../features/outbound-routes.md) call routes.

## First setup

1. Name the phone system and confirm its timezone.
2. Create a person, an extension, and a phone or softphone.
3. Connect a phone company, or deliberately leave public calling disconnected.
4. Choose where incoming calls ring and which calls may go out.
5. Confirm NAT, firewall, TLS, SRTP, and emergency-calling requirements.
6. Configure and verify a backup destination.
7. Run a normal test call to a phone you control. Use only a provider-approved procedure for emergency-call testing.

## Hosted deployment

The public site links the repository deployment guide. The deployment guide is informational until the runtime lane publishes the referenced Docker Compose files. The browser site never controls a PBX and never imitates a successful deployment.

## Desktop lab

The Windows desktop lab lets users explore controls and prepare drafts. The production PBX still runs on the dedicated Linux host. The desktop installer and updates are intentionally unsigned and can show an unknown-publisher warning.

