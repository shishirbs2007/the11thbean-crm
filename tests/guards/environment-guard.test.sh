source scripts/lib/environment-guard.sh
pass=0; fail=0
check() { # description, expected(0=allow,1=deny), command...
  local desc="$1"; local expected="$2"; shift 2
  if ( "$@" ) >/dev/null 2>&1; then actual=0; else actual=1; fi
  if [ "$actual" = "$expected" ]; then pass=$((pass+1)); echo "  ok   $desc";
  else fail=$((fail+1)); echo "  FAIL $desc (expected $expected got $actual)"; fi
}
echo "Environment guard:"
check "production ref is denied"            1 require_non_production "ehbkxldhajgcununyfat" "test"
check "production url is denied"            1 require_non_production "https://ehbkxldhajgcununyfat.supabase.co" "test"
check "other protected project denied"      1 require_non_production "ycvjhwnbekavnnztrwjb" "test"
check "empty target denied (fails closed)"  1 require_non_production "" "test"
check "loopback allowed"                    0 require_non_production "http://127.0.0.1:54321" "test"
check "localhost allowed"                   0 require_non_production "http://localhost:54321" "test"
check "unknown hosted denied without flag"  1 require_non_production "abcdefghijklmnopqrst" "test"
export CRM_ENVIRONMENT=staging
check "unknown hosted allowed when staging" 0 require_non_production "abcdefghijklmnopqrst" "test"
check "production still denied when staging" 1 require_non_production "ehbkxldhajgcununyfat" "test"
unset CRM_ENVIRONMENT
check "valid ref accepted"                  0 require_valid_ref "abcdefghijklmnopqrst"
check "short ref rejected"                  1 require_valid_ref "abc"
check "url as ref rejected"                 1 require_valid_ref "https://x.supabase.co"
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
