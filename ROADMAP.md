# Roadmap

## Foundation

- [x] Create the public monorepo UI structure.
- [x] Consume the WorldLens design-system package contract without copying it.
- [x] Add typed disconnected client behavior.
- [x] Pin the immutable published WorldLens design-system release asset.

## Product surfaces

- [x] Add the guided browser control surface.
- [x] Add one-click onboarding with plain-language telephony explanations.
- [x] Add the Windows desktop lab shell and unsigned Squirrel packaging route.
- [x] Add the landing and documentation site with an explicit non-runtime boundary.
- [x] Add a real control-service preflight, health/capability states, permission-aware resource loading, and confirmed-save path.
- [ ] Exercise those paths against a deployed control service and prove real PBX operations after the ultra-speed pass.

## Verification and release

- [ ] Run focused local tests after the ultra-speed pass is upgraded to the full verification workflow.
- [ ] Capture every real built surface through the approved headless route.
- [x] Build an unsigned Squirrel installer locally; runtime/install verification remains pending.
- [x] Publish and verify the first non-draft Windows release.
- [x] Enable the live GitHub Pages deployment.

## Native FreePBX runtime

- [x] Add transactional preview, snapshot, apply, removal, and rollback records for module-owned generated output.
- [x] Compile the bounded enabled ring-group subset through the FreePBX generation hook, including transactional disablement and deletion removal.
- [x] Add the bounded enabled queue compiler through the same transactional snapshot path, including guided member controls.
- [x] Add bounded extension and credentialless PJSIP trunk compilers with explicit generation boundaries.
- [x] Add bounded inbound/outbound route compilers with validated patterns, destinations, trunk order, and emergency constraints.
- [x] Add bounded IVR, voicemail, and time-condition compilers covering every typed application feature subset.
- [ ] Adapt deployment platform support for an inventoried host or provision a dedicated Debian 12 amd64 host.
- [ ] Resolve external HTTP/HTTPS publishing without disturbing the unrelated service already using ports 80 and 443.
- [x] Load module 0.1.0 on FreePBX 17, enable it, and verify creation of all three migration tables through `FreePBX::Database()`.
- [x] Compile a ring-group artifact with snapshots and prove single-use rollback restores its prior-null compiled state.
- [ ] Build and boot a fresh clean PBX container with the PATH-visible `fwconsole` link and corrected volume declarations.
- [ ] Prove generated custom includes, a complete FreePBX reload, ring-group dialplan, disablement, deletion, and a real runtime call.
- [ ] Verify cross-resource destination dispatch for all compiled feature subsets on a live FreePBX/Asterisk runtime.
