---
name: Imported artifact workflows
description: Environment-specific workflow behavior for imported artifact projects.
---

Imported projects can contain artifact service metadata without an actual configured workflow. When that happens, create one minimal workflow using the existing service command and explicitly provide the required port if the runner does not inject it.

**Why:** The imported API artifact had service metadata but no registered workflow, and its development command failed until `PORT=8080` was supplied.

**How to apply:** Check the configured workflow list before using a managed artifact workflow name; if it is empty, configure the existing service command rather than restructuring the project.