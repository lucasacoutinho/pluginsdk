import Lean
import PluginSdk

open Lean Meta

private def obligations : List (Name × Name × List Name) := [
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
    ``PluginSdk.Compiler.Bundle.V4_valid_bundle_accepted])
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
