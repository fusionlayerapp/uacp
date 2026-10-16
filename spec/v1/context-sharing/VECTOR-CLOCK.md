# Vector Clock v1

This document defines the vector clock format used by context-sharing events.

## §1 — Format

A vector clock is a JSON object mapping `device_id` strings to integer counters:

```json
{ "device-A": 3, "device-B": 1 }
```

Rules:

1. Counters MUST be integers `>= 0`.
2. Device IDs MUST be stable per device in a scope.

## §2 — Merge

To merge two clocks, take the element-wise maximum for every key:

`(A:3,B:1) + (A:2,B:4) → (A:3,B:4)`

## §3 — Conflict Surface

Two events are incomparable if neither clock dominates the other.

When clocks are incomparable, implementations MUST:

1. Break ties by `timestamp` (last-write-wins).
2. If both events are structural updates and their timestamps are within the same 1 second window, implementations SHOULD surface a conflict to the user.

