#!/usr/bin/env bash
set -Eeuo pipefail

npm install
npm run lint
npm run typecheck
npm run test:unit
npm run build

git add   package.json   package-lock.json   vitest.config.ts   tests/setup.ts   tests/unit/framework.test.ts

if git diff --cached --quiet; then
  echo "No staged changes to commit."
else
  git commit -m "Add Vitest validation framework"
  git push
fi

vercel --prod
