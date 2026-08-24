---
name: Character artwork sourcing
description: Safety and fidelity rule for images attached to verified character cards.
---

Only assign a character image URL when it is an approved, exact match for the existing verified character. When an image cannot be verified or its source is not approved, leave the reference unset and render the presentation fallback.

**Why:** Incorrect or uncertain artwork undermines the verified-catalog promise more than a deliberate fallback, and the bot must not scrape or randomly associate external images.

**How to apply:** Curate assets separately from gameplay changes, store only their persistent URLs (never image binaries) in the existing character image field, and preserve fallback behavior for any missing asset.