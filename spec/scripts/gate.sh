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
python3 scripts/check_process_quoting.py
python3 scripts/check_windows_quoting.py
python3 scripts/check_windows_streams.py
python3 scripts/check_process.py
python3 scripts/check_launcher.py
python3 scripts/check_repair.py
python3 scripts/check_authorization.py
python3 scripts/check_catalog.py
python3 scripts/check_artifacts.py
python3 scripts/check_tool_contracts.py
python3 scripts/check_distribution.py
python3 scripts/check_compatibility.py
python3 scripts/check_agents.py
python3 scripts/check_writers.py
python3 scripts/check_file_reads.py
python3 scripts/check_windows_paths.py
python3 scripts/check_windows_root_capacities.py
python3 scripts/check_tree_reads.py
python3 scripts/check_executable_intents.py
python3 scripts/check_staging_permissions.py
exit "$task_proof_rc"
