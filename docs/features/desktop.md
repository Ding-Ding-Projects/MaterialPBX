# Windows desktop lab

## Behavior

The desktop lab packages the same guided interface with a secure context-isolated shell and an unsigned Squirrel.Windows update path.

The guided view presents validated pickers, switches, ranges, and clear suggested defaults. The expert view exposes the underlying Asterisk and FreePBX concepts without making raw configuration text the only path.

## Configuration

Open **Windows desktop lab** from navigation or the command palette. Every search field starts in plain-text mode and has its own anchored regular-expression builder. Changes are drafts until a connected control service validates and applies them.

## Failure modes

- Disconnected surfaces show no fake records and save local drafts only.
- Unsupported server capabilities remain visible with an exact explanation.
- Network, validation, or authorization failures keep the last known valid state and offer a recovery action.
- Long operations report determinate progress when byte or item counts are available, remain cancellable, and report partial results.

## Security and privacy

Credentials stay outside renderer storage, logs, exports, history, screenshots, and public records. Destructive actions identify the affected data and use the two-key plus full-range confirmation control. Operational and security warnings remain visible; promotional prompts are not shown.

## Verification

The 0.1.1 candidate was built through `build-installer.bat /s`. Its installer contract passed 73 required checks and all five deliberate negative regressions. The prior candidate was uninstalled through its registered Squirrel updater, the rebuilt Setup executable completed with exit code 0, the installed registry identity reported MaterialPBX 0.1.1, and the installed executable was present at the registered application location. The Setup executable, updater, and installed application all report `NotSigned`, as required by the project's permanent no-signing policy.

The installed application was launched on an approved named hidden desktop. The resolved application window belonged to the recorded installed process, used class `Chrome_WidgetWin_1`, had the title `MaterialPBX Desktop Lab`, measured 2220×1410 at 150% display scale, and rendered the expected disconnected control center. The capture proves that the newly installed executable starts and paints this state. It does not prove a live PBX connection, keyboard-only operation, every surface, automatic-update installation, or production telephony behavior.

![Freshly installed MaterialPBX 0.1.1 desktop application showing the disconnected control center, guided setup action, navigation, and empty live-data cards.](../screenshots/installer-fresh-launch-0.1.1.png)

## Suggested articles

- [Guided onboarding](./onboarding.md)
- [Security](./security.md)
- [Live operations](./observability.md)
- [One-click hosting](./deployment.md)
