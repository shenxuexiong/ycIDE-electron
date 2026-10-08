# x64 Adaptation Fixture Matrix

This fixture matrix defines Phase 3 X64A contracts and blocked reason taxonomy.

## Batch Naming

- Batch ID format: `B{libraryIndex}-A{abiGroup}`
- Example: `B01-A-pointer-width`, `B01-A-layout-alignment`, `B01-A-callback-signature`

## Required ABI Dimensions (every library)

- `pointerWidth`
- `structLayoutAlignment`
- `callbackSignature`

## Fixed Blocked Reason Enums (D3-16)

- `missing_x64_artifact`
- `missing_x86_artifact`
- `x64_lane_failed`
- `x86_lane_failed`
- `abi_pointer_mismatch`
- `abi_layout_mismatch`
- `abi_callback_signature_mismatch`
- `abi_evidence_incomplete`
- `report_invariant_mismatch`

## X64A Contract Mapping

- X64A-01: baseline-ordered library processing emits deterministic x64 results.
- X64A-02: all three ABI dimensions must be present; missing evidence blocks.
- X64A-03: failures are explicit and machine-readable via fixed enum codes.
- X64A-04: x86 lane is mandatory and can independently block release.

## Notes

- Scope is Phase 3 only: no Phase 4 integration verification and no Phase 5 promotion actions.
