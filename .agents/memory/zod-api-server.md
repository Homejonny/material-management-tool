---
name: Zod in api-server
description: How to use zod validation in @workspace/api-server routes
---

The `@workspace/api-server` package does not include zod by default. To use zod in new routes:

1. Add `zod: "catalog:"` to `artifacts/api-server/package.json` `dependencies` (run `pnpm add zod --filter @workspace/api-server`).
2. Import as `import { z } from "zod/v4"` (not `"zod"` bare).

**Why:** The workspace catalog pins `zod: ^3.25.76` which supports the `zod/v4` subpath. The api-server's esbuild bundler resolves dependencies from the package's own node_modules, so it must be explicitly listed.

**How to apply:** Any new api-server route file that needs schema validation must follow this pattern. The `quotes.ts` pre-existing error about `integrations-openai-ai-server` dist not built is unrelated noise — ignore it in typecheck output.
