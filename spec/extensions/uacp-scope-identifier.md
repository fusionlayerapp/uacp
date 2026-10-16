# UACP Extension: Scope Identifier

**Status:** Draft  
**Version:** 0.6.0  
**Schema ID:** `https://hn2.github.io/uacp/schema/0.6.0/extensions/uacp-scope-identifier`

---

## 1. Overview

A `ScopeIdentifier` names a conversational or collaborative scope and declares its governance properties via seven mandatory axes. The governance axes describe cardinality, access control, role structure, override policy, audit visibility, default sync mode, and lifecycle.

Scopes are opaque identifiers at the UACP layer. Higher-level systems (e.g., FusionLayer) may assign preset names to common axis tuples, but those preset names are not normative for UACP.

---

## 2. Data Structures

### 2.1 ScopeIdentifier

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | UUID v4 string | yes | Opaque scope identifier. Consumers MUST NOT infer semantics from the UUID bits. |
| `governance` | GovernanceAxes | yes | All seven governance axes. |
| `created_at` | uint64 (integer ≥ 0) | yes | Monotonic creation timestamp in milliseconds. |
| `created_by` | string (43 chars, base64url) | yes | Ed25519 raw public key (32 bytes) of the identity that created the scope. |

### 2.2 GovernanceAxes

All seven axes MUST be present on every scope. Unknown values MUST be rejected.

| Axis | Type | Values |
|---|---|---|
| `cardinality` | enum | `solo`, `dyad`, `small`, `medium`, `large`, `open` |
| `invite_model` | enum | `self_only`, `peer`, `admin_gated`, `request_and_approve`, `open` |
| `role_structure` | enum | `flat`, `parent_child`, `member_lead_admin`, `custom` |
| `override` | enum | `none`, `parental_flagged_only`, `legal_hold_only` |
| `audit` | enum | `none`, `members_see_membership`, `members_see_content`, `admin_sees_aggregates` |
| `default_sync` | enum | `realtime`, `eventual`, `manual` |
| `lifecycle` | enum | `permanent`, `project_bounded`, `time_bounded`, `session_bounded` |

---

## 3. Axis Value Descriptions

### 3.1 cardinality

How many members the scope is designed for.

| Value | Description |
|---|---|
| `solo` | Single identity only (personal carve-out). |
| `dyad` | Exactly two identities (e.g., 1:1 DM). |
| `small` | 3–20 members (e.g., family, small team). |
| `medium` | 21–150 members (e.g., department, team). |
| `large` | 151–1000 members. |
| `open` | Unlimited or publicly accessible membership. |

### 3.2 invite_model

How new members join the scope.

| Value | Description |
|---|---|
| `self_only` | Only the owner can add themselves; no external invitations. |
| `peer` | Any existing member may invite others. |
| `admin_gated` | Only admins or designated leads may invite. |
| `request_and_approve` | Anyone may request to join; an admin approves. |
| `open` | Anyone may join without approval. |

### 3.3 role_structure

The role hierarchy within the scope.

| Value | Description |
|---|---|
| `flat` | All members have equal standing. |
| `parent_child` | Parent role can govern child members (e.g., guardian/minor). |
| `member_lead_admin` | Three-tier: regular members, leads, and admins. |
| `custom` | Implementation-defined role graph. |

### 3.4 override

Whether any party can inspect or override content privacy for this scope.

| Value | Description |
|---|---|
| `none` | No content override permitted by any party. |
| `parental_flagged_only` | Parent roles may flag and review content from child members. |
| `legal_hold_only` | Only a legal hold order can trigger content preservation/review. |

**Normative rule:** A `solo` (personal carve-out) scope MUST NOT carry `override: "legal_hold_only"`.

### 3.5 audit

What members or administrators can observe about this scope.

| Value | Description |
|---|---|
| `none` | No audit visibility beyond the scope owner. |
| `members_see_membership` | Members can see who else is in the scope. |
| `members_see_content` | Members can see all content in the scope. |
| `admin_sees_aggregates` | Admins receive aggregate statistics only (no individual content). |

### 3.6 default_sync

The default synchronization mode for content in this scope.

| Value | Description |
|---|---|
| `realtime` | Changes are propagated immediately to all members. |
| `eventual` | Changes propagate with best-effort delivery; ordering not guaranteed. |
| `manual` | Members explicitly pull or push changes. |

### 3.7 lifecycle

How long this scope persists.

| Value | Description |
|---|---|
| `permanent` | Scope persists indefinitely until explicitly deleted. |
| `project_bounded` | Scope is tied to a project and expires when the project closes. |
| `time_bounded` | Scope expires at a wall-clock time (expiry tracked separately). |
| `session_bounded` | Scope expires when the creating session ends. |

---

## 4. Normative Rules

1. All seven axes MUST be present on every `ScopeIdentifier`. Absence of any axis is an error (`MISSING_AXIS`).
2. All enum values MUST be from the defined value sets above. Unknown values MUST be rejected (`UNKNOWN_AXIS_VALUE`).
3. The `id` field MUST be a valid UUID v4. Invalid formats MUST be rejected (`INVALID_SCOPE_ID`).
4. The `id` field is opaque. Consumers MUST NOT infer scope semantics from UUID bits.
5. A `solo` scope MUST NOT carry `override: "legal_hold_only"`.

---

## 5. Error Codes

| Code | Condition |
|---|---|
| `UNKNOWN_AXIS_VALUE` | An enum axis contains a value not listed in §3. |
| `MISSING_AXIS` | One or more of the seven required axes is absent from `governance`. |
| `INVALID_SCOPE_ID` | The `id` field is not a valid UUID v4 string. |

---

## 6. FL Preset Axis Tuples (Non-Normative Examples)

The following tuples are documented as examples from the FusionLayer architecture (§5.4). They are NOT normative for UACP. Any valid combination of axis values is a conforming UACP scope.

| Preset | cardinality | invite_model | role_structure | override | audit | default_sync | lifecycle |
|---|---|---|---|---|---|---|---|
| private | solo | self_only | flat | none | none | realtime | permanent |
| project | small | peer | member_lead_admin | none | members_see_content | realtime | project_bounded |
| team | medium | admin_gated | member_lead_admin | none | members_see_membership | realtime | permanent |
| family | small | admin_gated | parent_child | parental_flagged_only | members_see_membership | eventual | permanent |
| group | small | peer | flat | none | members_see_membership | realtime | permanent |
| interest | open | open | flat | none | members_see_membership | eventual | permanent |

---

## 7. Scenario Mapping

| Scenario | Description | Key axes |
|---|---|---|
| 1 | Private preset axes validate | solo / self_only / flat / none / none / realtime / permanent |
| 8 | Team + project scopes coexist on same user identity | Two ScopeIdentifiers with different axes are both valid |
| 10 | Family preset includes parental override | override: parental_flagged_only |
| 11 | Personal carve-out MUST NOT carry override=legal_hold_only | solo scope with override: none is valid; legal_hold_only is prohibited |
