---
name: TypeScript ESM tests
description: Local import resolution when compiling TypeScript tests for Node's native ESM test runner.
---

When TypeScript tests are emitted as ESM and run with Node's native test runner, local source imports should use explicit `.js` extensions in the TypeScript source.

**Why:** Node's ESM loader does not reliably resolve extensionless emitted local imports, even when the TypeScript compiler accepts them under bundler resolution.

**How to apply:** For testable ESM modules, write local imports as `./module.js` and let TypeScript resolve them back to the `.ts` source during typechecking.