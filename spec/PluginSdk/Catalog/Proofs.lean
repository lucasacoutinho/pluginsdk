import PluginSdk.Catalog.Model
import PluginSdk.Catalog.Properties

namespace PluginSdk.Catalog.Proofs

private theorem no_key_of_absent (ledger : ReleaseLedger) (release : Release)
    (absent : ¬ ∃ prior, prior ∈ ledger ∧ prior.key = release.key) :
    ∀ prior ∈ ledger, prior.key ≠ release.key := by
  intro prior member sameKey
  exact absent ⟨prior, member, sameKey⟩

private theorem mem_filter_key_iff (ledger : ReleaseLedger) (key : ReleaseKey)
    (release : Release) :
    release ∈ ledger.filter (fun prior => decide (prior.key = key)) ↔
      release ∈ ledger ∧ release.key = key := by
  simp

private theorem packageDigest_eq_some_iff (packages : FormatDigests)
    (format : PackageFormat) (digest : String) :
    packageDigest packages format = some digest ↔ FormatDigest packages format digest := by
  cases format <;> simp [packageDigest, FormatDigest]

private theorem selectArtifact_success (source : Release) (target : ReleaseTarget)
    (result : Release) (artifact : SelectedArtifact)
    (success : selectArtifact source target = .resolved result artifact) :
    result = source ∧ Selects source target artifact := by
  cases source with
  | mk key version origin contents =>
    cases contents with
    | plugin plugin packages =>
      cases target with
      | mcp => simp [selectArtifact] at success
      | plugin format =>
        cases artifact with
        | plugin selected selectedFormat digest =>
          cases digestResult : packageDigest packages format with
          | none => simp [selectArtifact, digestResult] at success
          | some actual =>
            have success' :
                Resolution.resolved
                    { key := key, version := version, origin := origin,
                      contents := .plugin plugin packages }
                    (.plugin plugin format actual) =
                  .resolved result (.plugin selected selectedFormat digest) := by
              simpa [selectArtifact, digestResult] using success
            injection success' with resultEq artifactEq
            injection artifactEq with pluginEq formatEq digestEq
            constructor
            · exact resultEq.symm
            · refine ⟨pluginEq, formatEq, ?_⟩
              apply (packageDigest_eq_some_iff packages format digest).mp
              simpa [digestEq] using digestResult
        | mcp service contract =>
          cases digestResult : packageDigest packages format with
          | none => simp [selectArtifact, digestResult] at success
          | some digest => simp [selectArtifact, digestResult] at success
    | mcp service contract =>
      cases target with
      | plugin format => simp [selectArtifact] at success
      | mcp =>
        cases artifact with
        | plugin selected format digest => simp [selectArtifact] at success
        | mcp selected selectedContract =>
          have success' :
              Resolution.resolved
                  { key := key, version := version, origin := origin,
                    contents := .mcp service contract }
                  (.mcp service contract) =
                .resolved result (.mcp selected selectedContract) := by
            simpa [selectArtifact] using success
          injection success' with resultEq artifactEq
          injection artifactEq with serviceEq contractEq
          exact ⟨resultEq.symm, serviceEq, contractEq⟩

private theorem selectArtifact_from_selects (source : Release) (target : ReleaseTarget)
    (artifact : SelectedArtifact) (selection : Selects source target artifact) :
    selectArtifact source target = .resolved source artifact := by
  cases source with
  | mk key version origin contents =>
    cases contents with
    | plugin plugin packages =>
      cases target with
      | mcp => simp [Selects] at selection
      | plugin format =>
        cases artifact with
        | plugin selected selectedFormat digest =>
          rcases selection with ⟨rfl, rfl, digestPresent⟩
          have packagePresent :=
            (packageDigest_eq_some_iff packages format digest).mpr digestPresent
          simp [selectArtifact, packagePresent]
        | mcp service contract => simp [Selects] at selection
    | mcp service contract =>
      cases target with
      | plugin format => simp [Selects] at selection
      | mcp =>
        cases artifact with
        | plugin selected format digest => simp [Selects] at selection
        | mcp selected selectedContract =>
          rcases selection with ⟨rfl, rfl⟩
          rfl

theorem C1_registration_adds_only_absent_key :
    C1_registration_adds_only_absent_key model := by
  intro ledger release next registered
  by_cases conflict : ∃ prior, prior ∈ ledger ∧ prior.key = release.key ∧ prior ≠ release
  · simp [model, register, conflict] at registered
  · by_cases keyPresent : ∃ prior, prior ∈ ledger ∧ prior.key = release.key
    · simp [model, register, conflict, keyPresent] at registered
    · simp [model, register, conflict, keyPresent] at registered
      constructor
      · exact registered.symm
      · exact no_key_of_absent ledger release keyPresent

theorem C2_conflicting_identity_rejected :
    C2_conflicting_identity_rejected model := by
  intro ledger release conflicting
  obtain ⟨prior, member, sameKey, different⟩ := conflicting
  have hasConflict :
      ∃ item, item ∈ ledger ∧ item.key = release.key ∧ item ≠ release :=
    ⟨prior, member, sameKey, different⟩
  simp [model, register, hasConflict]

theorem C3_consistent_replay_unchanged :
    C3_consistent_replay_unchanged model := by
  intro ledger release member consistent
  have hasKey : ∃ prior, prior ∈ ledger ∧ prior.key = release.key :=
    ⟨release, member, rfl⟩
  have noConflict :
      ¬ ∃ prior, prior ∈ ledger ∧ prior.key = release.key ∧ prior ≠ release := by
    rintro ⟨prior, priorMember, sameKey, different⟩
    exact different (consistent prior priorMember sameKey)
  simp [model, register, noConflict, hasKey]

theorem C4_existing_bindings_preserved :
    C4_existing_bindings_preserved model := by
  intro ledger release prior old
  by_cases conflict : ∃ item, item ∈ ledger ∧ item.key = release.key ∧ item ≠ release
  · simp [model, StateAfter, register, conflict]
    constructor
    · exact old
    · intro next nextMember _
      exact nextMember
  · by_cases keyPresent : ∃ item, item ∈ ledger ∧ item.key = release.key
    · simp [model, StateAfter, register, conflict, keyPresent]
      constructor
      · exact old
      · intro next nextMember _
        exact nextMember
    · simp [model, StateAfter, register, conflict, keyPresent]
      constructor
      · simp [old]
      · intro next nextMember nextKey
        rcases nextMember with fromLedger | nextEq
        · exact fromLedger
        · subst next
          have priorKey : prior.key = release.key := nextKey.symm
          exact False.elim ((no_key_of_absent ledger release keyPresent prior old) priorKey)

theorem C5_resolution_selects_exact_artifact :
    C5_resolution_selects_exact_artifact model := by
  intro ledger key target release artifact resolved
  change resolve ledger key target = .resolved release artifact at resolved
  cases filtered : ledger.filter (fun prior => decide (prior.key = key)) with
  | nil =>
    simp [resolve, filtered] at resolved
  | cons first rest =>
    have firstInFilter :
        first ∈ ledger.filter (fun prior => decide (prior.key = key)) := by
      rw [filtered]
      simp
    obtain ⟨firstMember, firstKey⟩ :=
      (mem_filter_key_iff ledger key first).mp firstInFilter
    cases allEqual : rest.all (fun prior => decide (prior = first)) with
    | false =>
      simp [resolve, filtered, allEqual] at resolved
    | true =>
      have selected := selectArtifact_success first target release artifact (by
        simpa [resolve, filtered, allEqual] using resolved)
      obtain ⟨releaseEq, selection⟩ := selected
      subst release
      have consistent : ConsistentKey ledger first := by
        intro prior priorMember priorKey
        have filteredMember : prior ∈ ledger.filter (fun item => decide (item.key = key)) :=
          (mem_filter_key_iff ledger key prior).mpr
            ⟨priorMember, priorKey.trans firstKey⟩
        have inCons : prior ∈ first :: rest := by simpa [filtered] using filteredMember
        rcases List.mem_cons.mp inCons with isFirst | inRest
        · exact isFirst
        · have equal := List.all_eq_true.mp allEqual prior inRest
          simpa using equal
      exact ⟨firstMember, firstKey, consistent, selection⟩

theorem C6_available_artifact_resolves :
    C6_available_artifact_resolves model := by
  intro ledger release target artifact member consistent selection
  change resolve ledger release.key target = .resolved release artifact
  have releaseInFilter :
      release ∈ ledger.filter (fun prior => decide (prior.key = release.key)) :=
    (mem_filter_key_iff ledger release.key release).mpr ⟨member, rfl⟩
  cases filtered : ledger.filter (fun prior => decide (prior.key = release.key)) with
  | nil =>
    rw [filtered] at releaseInFilter
    simp at releaseInFilter
  | cons first rest =>
    have firstInFilter :
        first ∈ ledger.filter (fun prior => decide (prior.key = release.key)) := by
      rw [filtered]
      simp
    obtain ⟨firstMember, firstKey⟩ :=
      (mem_filter_key_iff ledger release.key first).mp firstInFilter
    have firstEq : first = release := consistent first firstMember firstKey
    have allEqual : rest.all (fun prior => decide (prior = first)) = true := by
      apply List.all_eq_true.mpr
      intro prior inRest
      have inFilter : prior ∈ ledger.filter (fun item => decide (item.key = release.key)) := by
        have inCons : prior ∈ first :: rest := List.mem_cons.mpr (Or.inr inRest)
        simpa [filtered] using inCons
      obtain ⟨priorMember, priorKey⟩ :=
        (mem_filter_key_iff ledger release.key prior).mp inFilter
      have priorEq := consistent prior priorMember priorKey
      simpa using priorEq.trans firstEq.symm
    have selectionFirst : Selects first target artifact := by
      simpa [firstEq] using selection
    have selected := selectArtifact_from_selects first target artifact selectionFirst
    unfold resolve
    rw [filtered]
    simp only
    simp only [allEqual]
    simpa [firstEq] using selected

end PluginSdk.Catalog.Proofs
