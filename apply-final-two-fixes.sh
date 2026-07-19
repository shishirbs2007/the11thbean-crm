#!/usr/bin/env bash
set -Eeuo pipefail

python3 - <<'PY'
from pathlib import Path

path = Path("src/app/(app)/visits/page.tsx")
content = path.read_text()

old = """            <select
              name="person_id"
              className="w-full rounded-xl border px-3 py-2"
            >
              <option value="">Guest visit</option>"""

new = """            <select
              name="person_id"
              required
              className="w-full rounded-xl border px-3 py-2"
            >
              <option value="">Select customer</option>"""

if old not in content:
    raise SystemExit(
        "Could not find the expected customer selector block in visits/page.tsx"
    )

path.write_text(content.replace(old, new, 1))
print("Updated visits/page.tsx")
PY

npm run lint
npm run typecheck
npm run test:unit
npm run build

git add \
  "src/app/(app)/visits/page.tsx" \
  "tests/e2e/customer-lifecycle.spec.ts" \
  "tests/e2e/visit-lifecycle.spec.ts"

git commit -m "Require customers for visits and fix lifecycle tests"
git push
vercel --prod
npm run test:auth
