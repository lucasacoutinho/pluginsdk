import Lean
import PluginSdk

open Lean Meta

private def obligations : List (Name × Name × List Name) := [
  (``PluginSdk.Compiler.Portable.Interface, `PluginSdk.Compiler.Portable.model, [
    ``PluginSdk.Compiler.Portable.PC1_exact_admission,
    ``PluginSdk.Compiler.Portable.PC2_documents_preserved,
    ``PluginSdk.Compiler.Portable.PC3_files_exact,
    ``PluginSdk.Compiler.Portable.PC4_runtime_exact,
    ``PluginSdk.Compiler.Portable.PC5_paths_safe,
    ``PluginSdk.Compiler.Portable.PC6_enumeration_invariant,
    ``PluginSdk.Compiler.Portable.PC7_diagnostics,
    ``PluginSdk.Compiler.Portable.PC8_empty_hooks_preserve_mcp]),
  (``PluginSdk.Compiler.Hooks.Portable.Interface, `PluginSdk.Compiler.Hooks.Portable.model, [
    ``PluginSdk.Compiler.Hooks.Portable.PH1_exact_admission,
    ``PluginSdk.Compiler.Hooks.Portable.PH2_document_exact,
    ``PluginSdk.Compiler.Hooks.Portable.PH3_files_exact,
    ``PluginSdk.Compiler.Hooks.Portable.PH4_paths_safe,
    ``PluginSdk.Compiler.Hooks.Portable.PH5_enumeration_invariant,
    ``PluginSdk.Compiler.Hooks.Portable.PH6_diagnostics,
    ``PluginSdk.Compiler.Hooks.Portable.PH7_empty_preserved,
    ``PluginSdk.Compiler.Hooks.Portable.PH8_process_preserved]),
  (``PluginSdk.Compiler.Hooks.Binding.Interface, `PluginSdk.Compiler.Hooks.Binding.model, [
    ``PluginSdk.Compiler.Hooks.Binding.HB1_claude_binding_exact,
    ``PluginSdk.Compiler.Hooks.Binding.HB2_codex_binding_exact,
    ``PluginSdk.Compiler.Hooks.Binding.HB3_data_paths_safe,
    ``PluginSdk.Compiler.Hooks.Binding.HB4_data_path_identity]),
  (``PluginSdk.Compiler.BuildFormat.Interface, `PluginSdk.Compiler.BuildFormat.model, [
    ``PluginSdk.Compiler.BuildFormat.BF1_agents_exact,
    ``PluginSdk.Compiler.BuildFormat.BF2_hooks_exact,
    ``PluginSdk.Compiler.BuildFormat.BF3_stdio_portable_exact,
    ``PluginSdk.Compiler.BuildFormat.BF4_basic_exact]),
  (``PluginSdk.Compatibility.ClientPackages.Interface, `PluginSdk.Compatibility.ClientPackages.model, [
    ``PluginSdk.Compatibility.ClientPackages.CB1_family_exact,
    ``PluginSdk.Compatibility.ClientPackages.CB2_normalization_exact,
    ``PluginSdk.Compatibility.ClientPackages.CB3_coverage_exact,
    ``PluginSdk.Compatibility.ClientPackages.CB4_valid_nonempty_output,
    ``PluginSdk.Compatibility.ClientPackages.CB5_membership_invariant,
    ``PluginSdk.Compatibility.ClientPackages.CB6_legacy_and_cursor_conservation]),
  (``PluginSdk.Project.Preview.Interface, `PluginSdk.Project.Preview.model, [
    ``PluginSdk.Project.Preview.PV1_direct_clients,
    ``PluginSdk.Project.Preview.PV2_no_provider,
    ``PluginSdk.Project.Preview.PV3_qualified_inheritance,
    ``PluginSdk.Project.Preview.PV4_unqualified_refusal,
    ``PluginSdk.Project.Preview.PV5_removal_direct,
    ``PluginSdk.Project.Preview.PV6_inherited_exact,
    ``PluginSdk.Project.Preview.PV7_apply_requires_provider,
    ``PluginSdk.Project.Preview.PV8_completion_inheritance_exact,
    ``PluginSdk.Project.Preview.PV9_failed_inheritance,
    ``PluginSdk.Project.Preview.PV10_direct_completion]),
  (``PluginSdk.Installer.ProcessDirectory.Interface, `PluginSdk.Installer.ProcessDirectory.model, [
    ``PluginSdk.Installer.ProcessDirectory.PD1_admitted_exact,
    ``PluginSdk.Installer.ProcessDirectory.PD2_unresolved_exact,
    ``PluginSdk.Installer.ProcessDirectory.PD3_capacity_refusal_exact,
    ``PluginSdk.Installer.ProcessDirectory.PD4_runtime_cwd_exact]),
  (``PluginSdk.Installer.LauncherRuntime.Interface, `PluginSdk.Installer.LauncherRuntime.model, [
    ``PluginSdk.Installer.LauncherRuntime.NR1_absent_requires_nothing,
    ``PluginSdk.Installer.LauncherRuntime.NR2_posix_checks_exact,
    ``PluginSdk.Installer.LauncherRuntime.NR3_portable_checks_exact,
    ``PluginSdk.Installer.LauncherRuntime.NR4_unsupported_exact,
    ``PluginSdk.Installer.LauncherRuntime.NR5_node_admission_exact]),
  (``PluginSdk.Installer.Locks.Interface, `PluginSdk.Installer.Locks.model, [
    ``PluginSdk.Installer.Locks.IL1_user_exact,
    ``PluginSdk.Installer.Locks.IL2_project_exact,
    ``PluginSdk.Installer.Locks.IL3_same_project_subject_across_homes,
    ``PluginSdk.Installer.Locks.IL4_exactly_one_home_first_input_home]),
  (``PluginSdk.Lifecycle.Interface, `PluginSdk.Lifecycle.model, [
    ``PluginSdk.Lifecycle.P1_unowned_never_starts,
    ``PluginSdk.Lifecycle.P2_unknown_never_starts,
    ``PluginSdk.Lifecycle.P3_drift_never_starts,
    ``PluginSdk.Lifecycle.P4_desired_fixed_point,
    ``PluginSdk.Lifecycle.P5_stale_before_rejected,
    ``PluginSdk.Lifecycle.P6_one_pending_operation,
    ``PluginSdk.Lifecycle.P7_resume_emits_no_mutation,
    ``PluginSdk.Lifecycle.P8_commit_requires_observation,
    ``PluginSdk.Lifecycle.P9_uncertainty_preserves_pending,
    ``PluginSdk.Lifecycle.P10_not_applied_preserves_ownership,
    ``PluginSdk.Lifecycle.P11_completed_replay_is_stable,
    ``PluginSdk.Lifecycle.P12_reused_id_rejects_new_desired,
    ``PluginSdk.Lifecycle.P13_completed_plan_never_restarts,
    ``PluginSdk.Lifecycle.P14_planning_basis_matches_journal]),
  (``PluginSdk.Compiler.Interface, `PluginSdk.Compiler.model, [
    ``PluginSdk.Compiler.B1_render_deterministic,
    ``PluginSdk.Compiler.B2_source_content_preserved,
    ``PluginSdk.Compiler.B3_output_paths_unique,
    ``PluginSdk.Compiler.B4_requested_content_accounted_for,
    ``PluginSdk.Compiler.B5_enumeration_order_irrelevant,
    ``PluginSdk.Compiler.B6_output_paths_contained,
    ``PluginSdk.Compiler.B7_copy_references_from_input,
    ``PluginSdk.Compiler.B8_header_meaning_preserved]),
  (``PluginSdk.Compiler.Bundle.Interface, `PluginSdk.Compiler.Bundle.model, [
    ``PluginSdk.Compiler.Bundle.V1_digest_checked,
    ``PluginSdk.Compiler.Bundle.V2_paths_canonical,
    ``PluginSdk.Compiler.Bundle.V3_diagnostics_exact,
    ``PluginSdk.Compiler.Bundle.V4_valid_bundle_accepted]),
  (``PluginSdk.Compiler.Assembly.Interface, `PluginSdk.Compiler.Assembly.model, [
    ``PluginSdk.Compiler.Assembly.A1_deterministic_canonical,
    ``PluginSdk.Compiler.Assembly.A2_preserves_requested_files_once,
    ``PluginSdk.Compiler.Assembly.A3_no_invented_files,
    ``PluginSdk.Compiler.Assembly.A4_contained_conflict_free,
    ``PluginSdk.Compiler.Assembly.A5_diagnostics_complete,
    ``PluginSdk.Compiler.Assembly.A6_permutation_invariant,
    ``PluginSdk.Compiler.Assembly.A7_valid_input_accepted]),
  (``PluginSdk.Repair.Interface, `PluginSdk.Repair.model, [
    ``PluginSdk.Repair.R1_blocked_never_starts,
    ``PluginSdk.Repair.R2_start_requires_fresh_review,
    ``PluginSdk.Repair.R3_start_preserves_operation_identity,
    ``PluginSdk.Repair.R4_cleanup_matches_residual,
    ``PluginSdk.Repair.R5_current_cleanup_retry_only_resumes,
    ``PluginSdk.Repair.R6_completion_requires_qualified_absence,
    ``PluginSdk.Repair.R7_other_settlement_preserves_pending_basis,
    ``PluginSdk.Repair.R8_completed_replay_acknowledges_without_start]),
  (``PluginSdk.Authorization.Interface, `PluginSdk.Authorization.model, [
    ``PluginSdk.Authorization.U1_unavailable_never_allows,
    ``PluginSdk.Authorization.U2_identity_is_bound,
    ``PluginSdk.Authorization.U3_current_evidence_required,
    ``PluginSdk.Authorization.U4_known_contract_required,
    ``PluginSdk.Authorization.U5_scopes_and_application_required,
    ``PluginSdk.Authorization.U6_effective_role_grant_required,
    ``PluginSdk.Authorization.U7_complete_authorization_succeeds,
    ``PluginSdk.Authorization.U8_revoked_grant_is_denied]),
  (``PluginSdk.Catalog.Interface, `PluginSdk.Catalog.model, [
    ``PluginSdk.Catalog.C1_registration_adds_only_absent_key,
    ``PluginSdk.Catalog.C2_conflicting_identity_rejected,
    ``PluginSdk.Catalog.C3_consistent_replay_unchanged,
    ``PluginSdk.Catalog.C4_existing_bindings_preserved,
    ``PluginSdk.Catalog.C5_resolution_selects_exact_artifact,
    ``PluginSdk.Catalog.C6_available_artifact_resolves]),
  (``PluginSdk.Catalog.Artifacts.Interface, `PluginSdk.Catalog.Artifacts.model, [
    ``PluginSdk.Catalog.Artifacts.E1_accepted_packages_exact,
    ``PluginSdk.Catalog.Artifacts.E2_complete_packages_accepted,
    ``PluginSdk.Catalog.Artifacts.E3_diagnostics_exact,
    ``PluginSdk.Catalog.Artifacts.E4_enumeration_invariant]),
  (``PluginSdk.Catalog.Tools.Interface, `PluginSdk.Catalog.Tools.model, [
    ``PluginSdk.Catalog.Tools.T1_accepted_tools_exact,
    ``PluginSdk.Catalog.Tools.T2_distinct_tools_accepted,
    ``PluginSdk.Catalog.Tools.T3_duplicate_diagnostics_exact,
    ``PluginSdk.Catalog.Tools.T4_tool_enumeration_invariant,
    ``PluginSdk.Catalog.Tools.T5_accepted_binding_exact,
    ``PluginSdk.Catalog.Tools.T6_matching_binding_accepted,
    ``PluginSdk.Catalog.Tools.T7_binding_diagnostics_exact]),
  (``PluginSdk.Distribution.Selection.Interface, `PluginSdk.Distribution.Selection.model, [
    ``PluginSdk.Distribution.Selection.S1_selected_is_sole_candidate,
    ``PluginSdk.Distribution.Selection.S2_sole_candidate_selected,
    ``PluginSdk.Distribution.Selection.S3_blocking_exact,
    ``PluginSdk.Distribution.Selection.S4_enumeration_invariant,
    ``PluginSdk.Distribution.Selection.S5_cursor_family_conservation]),
  (``PluginSdk.Distribution.Planning.Interface, `PluginSdk.Distribution.Planning.model, [
    ``PluginSdk.Distribution.Planning.D1_accepted_steps_exact,
    ``PluginSdk.Distribution.Planning.D2_ready_destinations_accepted,
    ``PluginSdk.Distribution.Planning.D3_issues_exact,
    ``PluginSdk.Distribution.Planning.D4_enumeration_invariant]),
  (``PluginSdk.Distribution.Execution.Interface, `PluginSdk.Distribution.Execution.model, [
    ``PluginSdk.Distribution.Execution.X1_prior_open_requires_exact_binding,
    ``PluginSdk.Distribution.Execution.X2_new_record_is_pending,
    ``PluginSdk.Distribution.Execution.X3_matching_prior_reopens,
    ``PluginSdk.Distribution.Execution.X4_scheduling_sound_complete,
    ``PluginSdk.Distribution.Execution.X5_recording_preserves_review,
    ``PluginSdk.Distribution.Execution.X6_eligible_recording_succeeds,
    ``PluginSdk.Distribution.Execution.X7_terminal_recording_rejected,
    ``PluginSdk.Distribution.Execution.X8_completion_exact,
    ``PluginSdk.Distribution.Execution.X9_terminal_replay_schedules_nothing]),
  (``PluginSdk.Compatibility.Interface, `PluginSdk.Compatibility.model, [
    ``PluginSdk.Compatibility.N1_selected_is_sole_profile,
    ``PluginSdk.Compatibility.N2_sole_profile_selected,
    ``PluginSdk.Compatibility.N3_blocking_exact,
    ``PluginSdk.Compatibility.N4_selection_enumeration_invariant,
    ``PluginSdk.Compatibility.N5_ownership_exact,
    ``PluginSdk.Compatibility.N6_ownership_isolation,
    ``PluginSdk.Compatibility.N7_qualified_version_change_retains_ownership,
    ``PluginSdk.Compatibility.N8_ownership_enumeration_invariant]),
  (``PluginSdk.Compiler.Agents.Interface, `PluginSdk.Compiler.Agents.model, [
    ``PluginSdk.Compiler.Agents.G1_declarations_exact,
    ``PluginSdk.Compiler.Agents.G2_definition_preserved,
    ``PluginSdk.Compiler.Agents.G3_namespace_exact,
    ``PluginSdk.Compiler.Agents.G4_paths_safe_distinct,
    ``PluginSdk.Compiler.Agents.G5_duplicate_issues_exact,
    ``PluginSdk.Compiler.Agents.G6_unique_input_succeeds,
    ``PluginSdk.Compiler.Agents.G7_enumeration_invariant,
    ``PluginSdk.Compiler.Agents.G8_empty_preserved]),
  (``PluginSdk.Installer.Companions.Interface, `PluginSdk.Installer.Companions.model, [
    ``PluginSdk.Installer.Companions.F1_accepted_before_safe,
    ``PluginSdk.Installer.Companions.F2_safe_input_succeeds,
    ``PluginSdk.Installer.Companions.F3_issues_exact,
    ``PluginSdk.Installer.Companions.F4_required_names_exact,
    ``PluginSdk.Installer.Companions.F5_changes_preserve_identities,
    ``PluginSdk.Installer.Companions.F6_unrelated_observations_irrelevant,
    ``PluginSdk.Installer.Companions.F7_enumeration_invariant,
    ``PluginSdk.Installer.Companions.F8_unchanged_set_keeps_only]),
  (``PluginSdk.Installer.ProjectActivation.Interface, `PluginSdk.Installer.ProjectActivation.model, [
    ``PluginSdk.Installer.ProjectActivation.PA1_build_admission_exact,
    ``PluginSdk.Installer.ProjectActivation.PA2_duplicate_diagnostics_exact,
    ``PluginSdk.Installer.ProjectActivation.PA3_cache_paths_exact,
    ``PluginSdk.Installer.ProjectActivation.PA4_agent_bindings_exact,
    ``PluginSdk.Installer.ProjectActivation.PA5_registration_preserved,
    ``PluginSdk.Installer.ProjectActivation.PA6_build_enumeration_invariant,
    ``PluginSdk.Installer.ProjectActivation.PA7_basic_package_has_no_agents,
    ``PluginSdk.Installer.ProjectActivation.PA8_market_source_does_not_change_cache,
    ``PluginSdk.Installer.ProjectActivation.RA1_authority_admission_exact,
    ``PluginSdk.Installer.ProjectActivation.RA2_authority_reason_exact,
    ``PluginSdk.Installer.ProjectActivation.RA3_owned_declarations_exact,
    ``PluginSdk.Installer.ProjectActivation.RA4_foreign_collision_refused,
    ``PluginSdk.Installer.ProjectActivation.RA5_basic_package_requires_no_role_scan,
    ``PluginSdk.Installer.ProjectActivation.RA6_authority_enumeration_invariant]),
  (``PluginSdk.Installer.ProjectConfig.Interface, `PluginSdk.Installer.ProjectConfig.model, [
    ``PluginSdk.Installer.ProjectConfig.J1_accepts_exactly_safe,
    ``PluginSdk.Installer.ProjectConfig.J2_block_reason_exact,
    ``PluginSdk.Installer.ProjectConfig.J3_foreign_bytes_preserved,
    ``PluginSdk.Installer.ProjectConfig.J4_desired_block_exact,
    ``PluginSdk.Installer.ProjectConfig.J5_unchanged_retains_document,
    ``PluginSdk.Installer.ProjectConfig.J6_completed_edit_is_idempotent]),
  (``PluginSdk.Installer.CompanionFile.Interface, `PluginSdk.Installer.CompanionFile.model, [
    ``PluginSdk.Installer.CompanionFile.RF1_linux_private_metadata_exact,
    ``PluginSdk.Installer.CompanionFile.RF2_windows_metadata_exact,
    ``PluginSdk.Installer.CompanionFile.RF3_unknown_platform_refused,
    ``PluginSdk.Installer.CompanionFile.RF4_foreign_representation_refused,
    ``PluginSdk.Installer.CompanionFile.RF5_review_requires_exact_basis,
    ``PluginSdk.Installer.CompanionFile.RF6_review_preserves_refusal,
    ``PluginSdk.Installer.CompanionFile.RF7_metadata_drift_refused,
    ``PluginSdk.Installer.CompanionFile.RF8_projection_exact]),
  (``PluginSdk.Installer.ProjectFile.Interface, `PluginSdk.Installer.ProjectFile.model, [
    ``PluginSdk.Installer.ProjectFile.PF1_linux_metadata_exact,
    ``PluginSdk.Installer.ProjectFile.PF2_windows_metadata_exact,
    ``PluginSdk.Installer.ProjectFile.PF3_unknown_platform_refused,
    ``PluginSdk.Installer.ProjectFile.PF4_foreign_representation_refused,
    ``PluginSdk.Installer.ProjectFile.PF5_review_requires_exact_basis,
    ``PluginSdk.Installer.ProjectFile.PF6_review_preserves_refusal,
    ``PluginSdk.Installer.ProjectFile.PF7_metadata_drift_refused]),
  (``PluginSdk.Installer.LocalSlot.Interface, `PluginSdk.Installer.LocalSlot.model, [
    ``PluginSdk.Installer.LocalSlot.LS1_unknown_refusal,
    ``PluginSdk.Installer.LocalSlot.LS2_foreign_owner_refusal,
    ``PluginSdk.Installer.LocalSlot.LS3_actions_require_valid_owned_roles,
    ``PluginSdk.Installer.LocalSlot.LS4_retire_requires_previous_live,
    ``PluginSdk.Installer.LocalSlot.LS5_publish_requires_staged_next,
    ``PluginSdk.Installer.LocalSlot.LS6_discard_retired_requires_desired_live,
    ``PluginSdk.Installer.LocalSlot.LS7_partial_cleanup_is_confined,
    ``PluginSdk.Installer.LocalSlot.LS8_prepare_preserves_initial_live,
    ``PluginSdk.Installer.LocalSlot.LS9_completion_is_exact,
    ``PluginSdk.Installer.LocalSlot.LS10_canonical_transition_table,
    ``PluginSdk.Installer.LocalSlot.LS11_same_plan_replacement_refused]),
  (``PluginSdk.Installer.LocalSlot.Cleanup.Interface, `PluginSdk.Installer.LocalSlot.Cleanup.model, [
    ``PluginSdk.Installer.LocalSlot.Cleanup.LC1_unknown_refusal,
    ``PluginSdk.Installer.LocalSlot.Cleanup.LC2_unowned_refusal,
    ``PluginSdk.Installer.LocalSlot.Cleanup.LC3_actions_require_owned_valid_roles,
    ``PluginSdk.Installer.LocalSlot.Cleanup.LC4_step_selects_present_role,
    ``PluginSdk.Installer.LocalSlot.Cleanup.LC5_completion_is_exact,
    ``PluginSdk.Installer.LocalSlot.Cleanup.LC6_admitted_residual_progresses,
    ``PluginSdk.Installer.LocalSlot.Cleanup.LC7_step_preserves_admission,
    ``PluginSdk.Installer.LocalSlot.Cleanup.LC8_step_decreases_role_count,
    ``PluginSdk.Installer.LocalSlot.Cleanup.LC9_three_steps_finish,
    ``PluginSdk.Installer.LocalSlot.Cleanup.LC10_archive_priority,
    ``PluginSdk.Installer.LocalSlot.Cleanup.LC11_invalid_operation_refused,
    ``PluginSdk.Installer.LocalSlot.Cleanup.LC12_invalid_role_claim_refused]),
  (``PluginSdk.Installer.LocalPackage.Interface, `PluginSdk.Installer.LocalPackage.model, [
    ``PluginSdk.Installer.LocalPackage.LP1_preserves_absent_and_unknown,
    ``PluginSdk.Installer.LocalPackage.LP2_owned_requires_approved_physical_root,
    ``PluginSdk.Installer.LocalPackage.LP3_owned_requires_valid_approval_and_usable_modes,
    ``PluginSdk.Installer.LocalPackage.LP4_owned_preserves_claim_and_basis,
    ``PluginSdk.Installer.LocalPackage.LP5_owned_files_match_approved_content_and_intent,
    ``PluginSdk.Installer.LocalPackage.LP6_owned_tree_is_closed_unique_and_confined,
    ``PluginSdk.Installer.LocalPackage.LP7_complete_covers_every_approved_file,
    ``PluginSdk.Installer.LocalPackage.LP8_partial_has_a_missing_approved_file,
    ``PluginSdk.Installer.LocalPackage.LP9_ambiguous_entries_never_produce_owned_output,
    ``PluginSdk.Installer.LocalPackage.LP10_canonical_full_and_partial_trees,
    ``PluginSdk.Installer.LocalPackage.LP11_permutation_invariance]),
  (``PluginSdk.Installer.LocalApproval.Interface, `PluginSdk.Installer.LocalApproval.model, [
    ``PluginSdk.Installer.LocalApproval.LA1_owners_exact,
    ``PluginSdk.Installer.LocalApproval.LA2_full_identity_exact,
    ``PluginSdk.Installer.LocalApproval.LA3_physical_root_exact,
    ``PluginSdk.Installer.LocalApproval.LA4_retained_descriptors_exact,
    ``PluginSdk.Installer.LocalApproval.LA5_bound_input_produces_approval]),
  (``PluginSdk.Installer.LocalObservation.Interface, `PluginSdk.Installer.LocalObservation.model, [
    ``PluginSdk.Installer.LocalObservation.LO1_auxiliary_roles_force_unknown,
    ``PluginSdk.Installer.LocalObservation.LO2_absence_is_exact,
    ``PluginSdk.Installer.LocalObservation.LO3_owned_present_preserves_identity_and_basis,
    ``PluginSdk.Installer.LocalObservation.LO4_unowned_present_preserves_basis,
    ``PluginSdk.Installer.LocalObservation.LO5_unknown_is_exact,
    ``PluginSdk.Installer.LocalObservation.LO6_pending_auxiliary_is_uncertain]),
  (``PluginSdk.Installer.Execution.Interface, `PluginSdk.Installer.Execution.model, [
    ``PluginSdk.Installer.Execution.I1_quiescence_exact,
    ``PluginSdk.Installer.Execution.I2_activity_exact,
    ``PluginSdk.Installer.Execution.I3_unknown_exact,
    ``PluginSdk.Installer.Execution.I4_job_accounting_not_completion]),
  (``PluginSdk.Installer.Worker.Interface, `PluginSdk.Installer.Worker.model, [
    ``PluginSdk.Installer.Worker.O1_start_exact,
    ``PluginSdk.Installer.Worker.O2_stop_exact,
    ``PluginSdk.Installer.Worker.O3_accepted_work_retained,
    ``PluginSdk.Installer.Worker.O4_no_second_start]),
  (``PluginSdk.Installer.Writers.Interface, `PluginSdk.Installer.Writers.model, [
    ``PluginSdk.Installer.Writers.Z1_resume_exact,
    ``PluginSdk.Installer.Writers.Z2_retention_exact,
    ``PluginSdk.Installer.Writers.Z3_ledger_monotone,
    ``PluginSdk.Installer.Writers.Z4_retention_failure_stops,
    ``PluginSdk.Installer.Writers.Z5_terminal_absorbs,
    ``PluginSdk.Installer.Writers.Z6_completion_exact,
    ``PluginSdk.Installer.Writers.Z7_activity_exact,
    ``PluginSdk.Installer.Writers.Z8_unknown_exact,
    ``PluginSdk.Installer.Writers.Z9_close_exact,
    ``PluginSdk.Installer.Writers.Z10_resume_identity_fresh,
    ``PluginSdk.Installer.Writers.Z11_observation_identity_bound,
    ``PluginSdk.Installer.Writers.Z12_observed_termination_exact,
    ``PluginSdk.Installer.Writers.Z13_observed_activity_exact,
    ``PluginSdk.Installer.Writers.Z14_observed_unknown_exact,
    ``PluginSdk.Installer.Writers.Z15_unbound_lookup_unknown,
    ``PluginSdk.Installer.Writers.Z16_reused_pid_terminated,
    ``PluginSdk.Installer.Writers.Z17_trace_covers_resumed_writers,
    ``PluginSdk.Installer.Writers.Z18_prior_owners_complete_exact,
    ``PluginSdk.Installer.Writers.Z19_prior_owners_active_exact,
    ``PluginSdk.Installer.Writers.Z20_prior_owners_unknown_exact,
    ``PluginSdk.Installer.Writers.Z21_self_owners_do_not_block,
    ``PluginSdk.Installer.Writers.Z22_owner_exemption_exact]),
  (``PluginSdk.Publication.Interface, `PluginSdk.Publication.model, [
    ``PluginSdk.Publication.W1_new_version_exact,
    ``PluginSdk.Publication.W2_historical_replay_unchanged,
    ``PluginSdk.Publication.W3_blocking_exact,
    ``PluginSdk.Publication.W4_preserves_history,
    ``PluginSdk.Publication.W5_completed_publication_is_idempotent,
    ``PluginSdk.Publication.W6_successful_history_unique]),
  (``PluginSdk.Compiler.Process.Interface, `PluginSdk.Compiler.Process.model, [
    ``PluginSdk.Compiler.Process.M1_accepts_exactly_representable,
    ``PluginSdk.Compiler.Process.M2_preserves_process,
    ``PluginSdk.Compiler.Process.M3_diagnostics_sound_complete,
    ``PluginSdk.Compiler.Process.M4_canonical_environment,
    ``PluginSdk.Compiler.Process.M5_enumeration_invariant]),
  (``PluginSdk.Compiler.Process.Quoting.Interface, `PluginSdk.Compiler.Process.Quoting.model, [
    ``PluginSdk.Compiler.Process.Quoting.Q1_literal_word_roundtrip]),
  (``PluginSdk.Installer.WindowsCommand.Quoting.Interface, `PluginSdk.Installer.WindowsCommand.Quoting.model, [
    ``PluginSdk.Installer.WindowsCommand.Quoting.Q2_windows_argument_roundtrip]),
  (``PluginSdk.Installer.WindowsCommand.Streams.Interface, `PluginSdk.Installer.WindowsCommand.Streams.model, [
    ``PluginSdk.Installer.WindowsCommand.Streams.Q3_stream_conservation,
    ``PluginSdk.Installer.WindowsCommand.Streams.Q4_stream_admission,
    ``PluginSdk.Installer.WindowsCommand.Streams.Q5_input_close_once,
    ``PluginSdk.Installer.WindowsCommand.Streams.Q6_input_stays_closed,
    ``PluginSdk.Installer.WindowsCommand.Streams.Q7_io_release_exact,
    ``PluginSdk.Installer.WindowsCommand.Streams.Q8_io_cancellation_waits,
    ``PluginSdk.Installer.WindowsCommand.Streams.Q9_io_released_absorbs,
    ``PluginSdk.Installer.WindowsCommand.Streams.Q10_io_release_once]),
  (``PluginSdk.Compiler.Process.Launcher.Interface, `PluginSdk.Compiler.Process.Launcher.model, [
    ``PluginSdk.Compiler.Process.Launcher.L1_capture_exact,
    ``PluginSdk.Compiler.Process.Launcher.L2_names_valid_fresh,
    ``PluginSdk.Compiler.Process.Launcher.L3_capture_coverage_distinct,
    ``PluginSdk.Compiler.Process.Launcher.L4_complete_process_preserved,
    ``PluginSdk.Compiler.Process.Launcher.L5_missing_source_stops,
    ``PluginSdk.Compiler.Process.Launcher.L6_native_shape_exact,
    ``PluginSdk.Compiler.Process.Launcher.L7_transfer_names_safe]),
  (``PluginSdk.Compiler.Process.Portable.Interface, `PluginSdk.Compiler.Process.Portable.model, [
    ``PluginSdk.Compiler.Process.Portable.PL1_exact_admission,
    ``PluginSdk.Compiler.Process.Portable.PL2_complete_process,
    ``PluginSdk.Compiler.Process.Portable.PL3_missing_source_stops,
    ``PluginSdk.Compiler.Process.Portable.PL4_capture_names,
    ``PluginSdk.Compiler.Process.Portable.PL5_native_shape,
    ``PluginSdk.Compiler.Process.Portable.PL6_posix_encoding,
    ``PluginSdk.Compiler.Process.Portable.PL7_diagnostics]),
  (``PluginSdk.Compiler.Process.Portable.Runtime.Interface, `PluginSdk.Compiler.Process.Portable.Runtime.model, [
    ``PluginSdk.Compiler.Process.Portable.Runtime.PR1_capture_protocol,
    ``PluginSdk.Compiler.Process.Portable.Runtime.PR2_execution_refines_launcher,
    ``PluginSdk.Compiler.Process.Portable.Runtime.PR3_complete_process,
    ``PluginSdk.Compiler.Process.Portable.Runtime.PR4_missing_source_stops]),
  (``PluginSdk.Compiler.Mcp.Interface, `PluginSdk.Compiler.Mcp.model, [
    ``PluginSdk.Compiler.Mcp.K1_servers_exact,
    ``PluginSdk.Compiler.Mcp.K2_generated_files_exact,
    ``PluginSdk.Compiler.Mcp.K3_launcher_paths_safe,
    ``PluginSdk.Compiler.Mcp.K4_accepts_exactly_native,
    ``PluginSdk.Compiler.Mcp.K5_enumeration_invariant,
    ``PluginSdk.Compiler.Mcp.K6_remote_document_preserved,
    ``PluginSdk.Compiler.Mcp.K7_cwd_root_preserved]),
  (``PluginSdk.Compiler.Mcp.Portable.Interface, `PluginSdk.Compiler.Mcp.Portable.model, [
    ``PluginSdk.Compiler.Mcp.Portable.PM1_exact_admission,
    ``PluginSdk.Compiler.Mcp.Portable.PM2_document_exact,
    ``PluginSdk.Compiler.Mcp.Portable.PM3_files_exact,
    ``PluginSdk.Compiler.Mcp.Portable.PM4_paths_safe,
    ``PluginSdk.Compiler.Mcp.Portable.PM5_enumeration_invariant,
    ``PluginSdk.Compiler.Mcp.Portable.PM6_diagnostics]),
  (``PluginSdk.Compiler.Hooks.Interface, `PluginSdk.Compiler.Hooks.model, [
    ``PluginSdk.Compiler.Hooks.H1_document_exact,
    ``PluginSdk.Compiler.Hooks.H2_files_exact,
    ``PluginSdk.Compiler.Hooks.H3_handlers_exact,
    ``PluginSdk.Compiler.Hooks.H4_paths_safe,
    ``PluginSdk.Compiler.Hooks.H5_acceptance_exact,
    ``PluginSdk.Compiler.Hooks.H6_enumeration_invariant,
    ``PluginSdk.Compiler.Hooks.H7_empty_preserved,
    ``PluginSdk.Compiler.Hooks.H8_process_preserved]),
  (``PluginSdk.FileRead.Interface, `PluginSdk.FileRead.model, [
    ``PluginSdk.FileRead.V1_plain_parse_exact,
    ``PluginSdk.FileRead.V2_containment_exact,
    ``PluginSdk.FileRead.V3_admission_exact,
    ``PluginSdk.FileRead.V4_unavailable_refuses,
    ``PluginSdk.FileRead.V5_stream_refuses,
    ``PluginSdk.FileRead.V6_root_change_refuses,
    ``PluginSdk.FileRead.V7_escape_refuses,
    ``PluginSdk.FileRead.V8_metadata_change_refuses,
    ``PluginSdk.FileRead.V9_non_regular_refuses,
    ``PluginSdk.FileRead.V10_identity_alone_insufficient]),
  (``PluginSdk.WindowsPath.Interface, `PluginSdk.WindowsPath.model, [
    ``PluginSdk.WindowsPath.WP1_admission_exact,
    ``PluginSdk.WindowsPath.WP2_syntax_exact,
    ``PluginSdk.WindowsPath.WP3_device_exact,
    ``PluginSdk.WindowsPath.WP4_component_limit_exact,
    ``PluginSdk.WindowsPath.WP5_path_limit_exact,
    ``PluginSdk.WindowsPath.WP6_capacity_monotone,
    ``PluginSdk.WindowsPath.WP7_colon_refuses,
    ``PluginSdk.WindowsPath.WP8_accepted_limits,
    ``PluginSdk.WindowsPath.WP9_supplementary_boundary,
    ``PluginSdk.WindowsPath.WP10_root_capacity_exact,
    ``PluginSdk.WindowsPath.WP11_complete_names_fit,
    ``PluginSdk.WindowsPath.WP12_root_budget_greatest,
    ``PluginSdk.WindowsPath.WP13_root_capacity_monotone,
    ``PluginSdk.WindowsPath.WP14_root_view_order_independent,
    ``PluginSdk.WindowsPath.WP15_native_exact_matches,
    ``PluginSdk.WindowsPath.WP16_native_other_platform_exact,
    ``PluginSdk.WindowsPath.WP17_native_admission_exact,
    ``PluginSdk.WindowsPath.WP18_native_unsafe_has_no_alias,
    ``PluginSdk.WindowsPath.WP19_native_other_path_refused,
    ``PluginSdk.WindowsPath.WP20_native_extended_matches]),
  (``PluginSdk.TreeRead.Interface, `PluginSdk.TreeRead.model, [
    ``PluginSdk.TreeRead.TR1_entry_acceptance_exact,
    ``PluginSdk.TreeRead.TR2_entry_unavailable_refuses,
    ``PluginSdk.TreeRead.TR3_disallowed_reparse_refuses,
    ``PluginSdk.TreeRead.TR4_component_alias_refuses,
    ``PluginSdk.TreeRead.TR5_entry_escape_refuses,
    ``PluginSdk.TreeRead.TR6_ancestor_cycle_refuses,
    ``PluginSdk.TreeRead.TR7_entry_rebinding_refuses,
    ``PluginSdk.TreeRead.TR8_directory_acceptance_exact,
    ``PluginSdk.TreeRead.TR9_failed_enumeration_refuses,
    ``PluginSdk.TreeRead.TR10_duplicate_member_refuses,
    ``PluginSdk.TreeRead.TR11_every_member_visited_once,
    ``PluginSdk.TreeRead.TR12_changed_directory_refuses,
    ``PluginSdk.TreeRead.TR13_enumeration_order_independent]),
  (``PluginSdk.ExecutableIntent.Interface, `PluginSdk.ExecutableIntent.model, [
    ``PluginSdk.ExecutableIntent.EI1_permission_semantics,
    ``PluginSdk.ExecutableIntent.EI2_filesystem_resolution_exact,
    ``PluginSdk.ExecutableIntent.EI3_declaration_resolution_exact,
    ``PluginSdk.ExecutableIntent.EI4_source_paths_preserved,
    ``PluginSdk.ExecutableIntent.EI5_unusable_source_modes_refuse,
    ``PluginSdk.ExecutableIntent.EI6_duplicate_source_paths_refuse,
    ``PluginSdk.ExecutableIntent.EI7_invalid_declarations_refuse,
    ``PluginSdk.ExecutableIntent.EI8_declaration_membership_exact,
    ``PluginSdk.ExecutableIntent.EI9_declaration_order_independent,
    ``PluginSdk.ExecutableIntent.EI10_payload_resolution_exact,
    ``PluginSdk.ExecutableIntent.EI11_payload_binding_refuses,
    ``PluginSdk.ExecutableIntent.EI12_payload_native_drift_refuses,
    ``PluginSdk.ExecutableIntent.EI13_unrepresented_intent_preserved,
    ``PluginSdk.ExecutableIntent.EI14_unavailable_payload_refuses,
    ``PluginSdk.ExecutableIntent.EI15_source_refusal_witness,
    ``PluginSdk.ExecutableIntent.EI16_payload_refusal_witness,
    ``PluginSdk.ExecutableIntent.EI17_stage_intent_exact,
    ``PluginSdk.ExecutableIntent.EI18_stage_data_bits_preserved,
    ``PluginSdk.ExecutableIntent.EI19_stage_matching_bits_preserved,
    ``PluginSdk.ExecutableIntent.EI20_stage_owner_bit_only])
]

private def standardAxioms : List Name := [``propext, ``Classical.choice, ``Quot.sound]

private def checkDesign : MetaM Unit := do
  let env ← getEnv
  let mut failures : Array String := #[]
  let mut proved := 0
  let mut required := 0
  for (interfaceName, modelName, properties) in obligations do
    let validModel ← match env.find? modelName with
      | none =>
        failures := failures.push s!"OPEN {modelName}: no concrete model"
        pure false
      | some info =>
        let valid ← isDefEq info.type (mkConst interfaceName)
        unless valid do failures := failures.push s!"FAIL {modelName}: wrong interface"
        pure valid
    for property in properties do
      required := required + 1
      let proofName := Name.str (property.getPrefix ++ `Proofs) property.getString!
      match env.find? proofName with
      | none => failures := failures.push s!"OPEN {property}"
      | some (.thmInfo info) =>
        if !validModel then
          failures := failures.push s!"FAIL {proofName}: no valid model"
        else if ← isDefEq info.type (mkApp (mkConst property) (mkConst modelName)) then
          let bad := (← collectAxioms proofName).filter (!standardAxioms.contains ·)
          if bad.isEmpty then proved := proved + 1
          else failures := failures.push s!"FAIL {proofName}: forbidden axioms {bad.toList}"
        else failures := failures.push s!"FAIL {proofName}: wrong property type"
      | some _ => failures := failures.push s!"FAIL {proofName}: expected a theorem"
  for (name, _) in env.constants.toList do
    unless (`PluginSdk).isPrefixOf name do continue
    let bad := (← collectAxioms name).filter (!standardAxioms.contains ·)
    unless bad.isEmpty do
      failures := failures.push s!"FAIL {name}: forbidden axioms {bad.toList}"
  for failure in failures do IO.println failure
  IO.println s!"{proved}/{required} property proofs checked"
  unless failures.isEmpty do throwError "RED: Lean design obligations remain open"

#eval checkDesign
