# UACP Vector Clock Extension

**Status:** Draft  
**Extension ID:** `uacp-vector-clock`  
**Schema:** `https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-vector-clock`

---

## 1. Type Definition

```
VectorClock = { [device_id: UUID]: uint64 }
```

- Keys are device identifiers formatted as UUID v4 (lowercase, hyphenated).
- Values are unsigned 64-bit integers representing the logical event counter for that device.
- Stored as a CBOR map with keys sorted lexicographically (deterministic encoding).
- A VectorClock MUST contain at least 1 entry and at most 256 entries.

---

## 2. Dominance

Clock `A` **dominates** clock `B` if and only if:

1. For every `device_id` present in `B`, `A[device_id] >= B[device_id]` (missing keys are treated as 0), **AND**
2. There exists at least one `device_id` where `A[device_id] > B[device_id]`.

Pseudocode:

```
function dominates(A, B):
  allDevices = union(keys(A), keys(B))
  hasGreater = false
  for device in allDevices:
    av = A[device] ?? 0
    bv = B[device] ?? 0
    if av < bv: return false
    if av > bv: hasGreater = true
  return hasGreater
```

---

## 3. Concurrency

Clocks `A` and `B` are **concurrent** if neither dominates the other:

```
function concurrent(A, B):
  return !dominates(A, B) AND !dominates(B, A)
```

Concurrency implies that two events were produced independently (e.g., both devices worked offline from a common ancestor state).

---

## 4. Merge Rule

When an incoming event's vector clock arrives at a device:

- If the incoming clock **dominates** the device's current clock view → append the event linearly (no branch).
- Otherwise (concurrent or device clock dominates incoming) → **branch**. Both branches are retained. Conflict surfacing is the consumer's responsibility.

The merged (combined) clock after a reconciliation is the component-wise maximum:

```
function merge(A, B):
  result = copy(A)
  for (device, value) in B:
    result[device] = max(result[device] ?? 0, value)
  return result
```

---

## 5. Increment Rule

Before a device produces a new event, it increments its own slot by 1 and copies all other slots unchanged:

```
function increment(clock, ownDeviceId):
  result = copy(clock)
  result[ownDeviceId] = (clock[ownDeviceId] ?? 0) + 1
  return result
```

---

## 6. Garbage Collection

Retired device entries (devices that no longer participate) MAY be compacted once all surviving devices have a clock value greater than or equal to the retired device's last known contribution. This ensures that no surviving device could still be in a causal dependency on an event from the retired device that has not yet been seen.

---

## 7. Error Codes

### CLOCK_FORMAT_INVALID

Raised when any of the following conditions are detected:

- A key is not a valid UUID v4 (lowercase hyphenated format).
- A value is not a non-negative integer (e.g., a float, string, negative number, or null).
- The CBOR encoding is non-deterministic (keys not lexicographically sorted).

### CLOCK_OVERFLOW

Raised when any slot value exceeds `2^63 - 1` (9223372036854775807).

**Note on JSON number precision:** JSON numbers are IEEE-754 doubles with 53-bit mantissa precision. Values above `Number.MAX_SAFE_INTEGER` (9007199254740991) cannot be represented exactly in standard JSON. Implementations operating in JavaScript or other environments with similar limitations MUST document their uint64 handling strategy. The schema cannot reliably enforce the overflow bound at the JSON layer; enforcement is normative at the implementation layer.

---

## 8. Test Scenario Mapping

| Fixture | Scenario | Description |
|---------|----------|-------------|
| `01-linear-chain-one-device.json` | Scenario 2 | Six sessions, one device, strictly linear chain |
| `02-five-devices-interleave.json` | Scenario 3 | Five devices interleaving, each new clock dominates previous |
| `03-two-vendor-sdk-converge.json` | Scenario 4 (Tier-1) | Two vendor SDKs produce concurrent clocks; merge converges |
| `04-offline-replay.json` | Scenario 6 | 23 events queued offline, merged against post-partition state |
| `05-two-users-offline-branch.json` | Scenario 14 | Two users append offline, reconnect — two branches detectable |
| `negative-01-overflow.json` | — | Documents CLOCK_OVERFLOW requirement |
