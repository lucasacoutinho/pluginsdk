#!/usr/bin/env bash
set -euo pipefail

task_spec_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$task_spec_root"

lake build
task_proof_rc=0
lake env lean scripts/Check.lean || task_proof_rc=$?
lake build oracle
python3 scripts/check_replay.py
python3 scripts/check_compiler.py
python3 scripts/check_bundle.py
python3 scripts/check_assembly.py
python3 scripts/check_repair.py
python3 scripts/check_authorization.py
python3 scripts/check_catalog.py
exit "$task_proof_rc"
