# Rules Sources

This project is being upgraded toward full Pax Pamir 2e rules fidelity.

## Authoritative sources to use during implementation

- Pax Pamir Second Edition official rulebook
- Wehrlegig clarifications and official FAQ (when available)
- Card text as printed in the physical deck

## Implementation policy

- Engine behavior must always follow card text first, then rulebook timing/structure.
- If a behavior is ambiguous, add a note to `docs/rules-clarifications.md`.
- Never silently "assume" rulings in engine logic without documenting them.
