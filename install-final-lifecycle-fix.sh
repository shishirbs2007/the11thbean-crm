#!/usr/bin/env bash
set -Eeuo pipefail

supabase db push
npm run lint
npm run typecheck
npm run test:unit
npm run build

git add   supabase/migrations/202607200200_visit_created_by.sql   tests/e2e/customer-lifecycle.spec.ts

if git diff --cached --quiet; then
  echo "No staged changes to commit."
else
  git commit -m "Fix visit authorship schema and lifecycle test"
  git push
fi

vercel --prod
npm run test:auth
