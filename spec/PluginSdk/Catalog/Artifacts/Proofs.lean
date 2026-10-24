import PluginSdk.Catalog.Artifacts.Model
import PluginSdk.Catalog.Artifacts.Properties

namespace PluginSdk.Catalog.Artifacts

private theorem packageDigest_eq_some_iff (packages : Catalog.FormatDigests)
    (format : Catalog.PackageFormat) (digest : String) :
    Catalog.packageDigest packages format = some digest ↔
      Catalog.FormatDigest packages format digest := by
  cases format <;> simp [Catalog.packageDigest, Catalog.FormatDigest]

private theorem packageDigest_eq_none_iff (packages : Catalog.FormatDigests)
    (format : Catalog.PackageFormat) :
    Catalog.packageDigest packages format = none ↔
      ¬ ∃ digest, Catalog.FormatDigest packages format digest := by
  cases result : Catalog.packageDigest packages format with
  | none =>
    constructor
    · intro _ present
      obtain ⟨digest, declared⟩ := present
      have someResult := (packageDigest_eq_some_iff packages format digest).mpr declared
      rw [result] at someResult
      cases someResult
    · intro _
      rfl
  | some digest =>
    constructor
    · intro impossible
      cases impossible
    · intro absent
      exact False.elim (absent ⟨digest, (packageDigest_eq_some_iff ..).mp result⟩)

private theorem exists_format_mem_iff (artifacts : List PackageDescriptor)
    (format : Catalog.PackageFormat) :
    (∃ artifact ∈ artifacts, artifact.format = format) ↔
      countFormat artifacts format > 0 := by
  simp [countFormat, List.countP_eq_length_filter]

private theorem formatDigest_unique (packages : Catalog.FormatDigests)
    (format : Catalog.PackageFormat) (left right : String)
    (leftPresent : Catalog.FormatDigest packages format left)
    (rightPresent : Catalog.FormatDigest packages format right) : left = right := by
  cases format <;> simp_all [Catalog.FormatDigest]

private theorem digestMismatchCandidates_iff (input : Input) (format : Catalog.PackageFormat)
    (expected : String) (expectedPresent : Catalog.FormatDigest input.packages format expected) :
    (∃ artifact ∈ input.artifacts,
      artifact.format = format ∧ artifact.digest ≠ expected) ↔
    (∃ artifact ∈ input.artifacts,
      artifact.format = format ∧ ∃ digest,
        Catalog.FormatDigest input.packages format digest ∧ artifact.digest ≠ digest) := by
  constructor
  · rintro ⟨artifact, member, formatMatches, mismatch⟩
    exact ⟨artifact, member, formatMatches, expected, expectedPresent, mismatch⟩
  · rintro ⟨artifact, member, formatMatches, digest, digestPresent, mismatch⟩
    have equal := formatDigest_unique input.packages format expected digest expectedPresent digestPresent
    subst digest
    exact ⟨artifact, member, formatMatches, mismatch⟩

def Issue.packageFormat : Issue → Catalog.PackageFormat
  | .missingPackage format | .unexpectedPackage format | .duplicatePackage format
  | .pluginMismatch format | .versionMismatch format | .digestMismatch format => format

private theorem mem_allFormats (format : Catalog.PackageFormat) : format ∈ allFormats := by
  cases format <;> simp [allFormats]

private theorem mem_formatIssues (input : Input) (format : Catalog.PackageFormat)
    (issue : Issue) :
    issue ∈ formatIssues input format ↔
      issue.packageFormat = format ∧ RequiredIssue input issue := by
  cases issue with
  | missingPackage target =>
    by_cases same : target = format
    · subst format
      simp [Issue.packageFormat, RequiredIssue]
      cases declared : Catalog.packageDigest input.packages target with
      | none =>
        have absent := (packageDigest_eq_none_iff input.packages target).mp declared
        change (Issue.missingPackage target ∈ formatIssues input target) ↔
          ((∃ digest, Catalog.FormatDigest input.packages target digest) ∧
            countFormat input.artifacts target = 0)
        constructor
        · intro member
          simp [formatIssues, declared] at member
        · rintro ⟨present, _⟩
          exact False.elim (absent present)
      | some digest =>
        have present : ∃ value, Catalog.FormatDigest input.packages target value :=
          ⟨digest, (packageDigest_eq_some_iff input.packages target digest).mp declared⟩
        change (Issue.missingPackage target ∈ formatIssues input target) ↔
          ((∃ value, Catalog.FormatDigest input.packages target value) ∧
            countFormat input.artifacts target = 0)
        constructor
        · intro member
          have count := by simpa [formatIssues, declared] using member
          exact ⟨present, count⟩
        · rintro ⟨_, count⟩
          simp [formatIssues, declared, count]
    · simp [Issue.packageFormat, RequiredIssue, same]
      intro member
      cases declared : Catalog.packageDigest input.packages format <;>
        simp [formatIssues, declared, same] at member
  | unexpectedPackage target =>
    by_cases same : target = format
    · subst format
      simp [Issue.packageFormat, RequiredIssue]
      cases declared : Catalog.packageDigest input.packages target with
      | none =>
        have absent := (packageDigest_eq_none_iff input.packages target).mp declared
        change (Issue.unexpectedPackage target ∈ formatIssues input target) ↔
          ((∀ digest, ¬ Catalog.FormatDigest input.packages target digest) ∧
            ∃ artifact ∈ input.artifacts, artifact.format = target)
        constructor
        · intro member
          have nonzero : countFormat input.artifacts target ≠ 0 := by
            simpa [formatIssues, declared] using member
          exact ⟨(fun digest present => absent ⟨digest, present⟩),
            (exists_format_mem_iff input.artifacts target).mpr (by omega)⟩
        · rintro ⟨_, candidates⟩
          have positive := (exists_format_mem_iff input.artifacts target).mp candidates
          have nonzero : countFormat input.artifacts target ≠ 0 := Nat.ne_of_gt positive
          simpa [formatIssues, declared] using nonzero
      | some digest =>
        have present := (packageDigest_eq_some_iff input.packages target digest).mp declared
        change (Issue.unexpectedPackage target ∈ formatIssues input target) ↔
          ((∀ value, ¬ Catalog.FormatDigest input.packages target value) ∧
            ∃ artifact ∈ input.artifacts, artifact.format = target)
        constructor
        · intro member
          simp [formatIssues, declared] at member
        · rintro ⟨absent, _⟩
          exact False.elim (absent digest present)
    · simp [Issue.packageFormat, RequiredIssue, same]
      intro member
      cases declared : Catalog.packageDigest input.packages format <;>
        simp [formatIssues, declared, same] at member
  | duplicatePackage target =>
    by_cases same : target = format
    · subst format
      simp [Issue.packageFormat, RequiredIssue]
      change (Issue.duplicatePackage target ∈ formatIssues input target) ↔
        1 < countFormat input.artifacts target
      cases declared : Catalog.packageDigest input.packages target <;>
        simp [formatIssues, declared]
    · simp [Issue.packageFormat, RequiredIssue, same]
      intro member
      cases declared : Catalog.packageDigest input.packages format <;>
        simp [formatIssues, declared, same] at member
  | pluginMismatch target =>
    by_cases same : target = format
    · subst format
      simp [Issue.packageFormat, RequiredIssue]
      change (Issue.pluginMismatch target ∈ formatIssues input target) ↔
        (∃ artifact ∈ input.artifacts,
          artifact.format = target ∧ artifact.plugin ≠ input.plugin)
      cases declared : Catalog.packageDigest input.packages target <;>
        simp [formatIssues, declared]
    · simp [Issue.packageFormat, RequiredIssue, same]
      intro member
      cases declared : Catalog.packageDigest input.packages format <;>
        simp [formatIssues, declared, same] at member
  | versionMismatch target =>
    by_cases same : target = format
    · subst format
      simp [Issue.packageFormat, RequiredIssue]
      change (Issue.versionMismatch target ∈ formatIssues input target) ↔
        (∃ artifact ∈ input.artifacts,
          artifact.format = target ∧ artifact.version ≠ input.version)
      cases declared : Catalog.packageDigest input.packages target <;>
        simp [formatIssues, declared]
    · simp [Issue.packageFormat, RequiredIssue, same]
      intro member
      cases declared : Catalog.packageDigest input.packages format <;>
        simp [formatIssues, declared, same] at member
  | digestMismatch target =>
    by_cases same : target = format
    · subst format
      simp [Issue.packageFormat, RequiredIssue]
      cases declared : Catalog.packageDigest input.packages target with
      | none =>
        have absent := (packageDigest_eq_none_iff input.packages target).mp declared
        change (Issue.digestMismatch target ∈ formatIssues input target) ↔
          (∃ artifact ∈ input.artifacts, artifact.format = target ∧
            ∃ digest, Catalog.FormatDigest input.packages target digest ∧
              artifact.digest ≠ digest)
        constructor
        · intro member
          simp [formatIssues, declared] at member
        · rintro ⟨artifact, artifactMember, formatMatches, digest, digestPresent, _⟩
          exact False.elim (absent ⟨digest, digestPresent⟩)
      | some digest =>
        have present := (packageDigest_eq_some_iff input.packages target digest).mp declared
        change (Issue.digestMismatch target ∈ formatIssues input target) ↔
          (∃ artifact ∈ input.artifacts, artifact.format = target ∧
            ∃ value, Catalog.FormatDigest input.packages target value ∧
              artifact.digest ≠ value)
        simpa [formatIssues, declared] using
          digestMismatchCandidates_iff input target digest present
    · simp [Issue.packageFormat, RequiredIssue, same]
      intro member
      cases declared : Catalog.packageDigest input.packages format <;>
        simp [formatIssues, declared, same] at member

private theorem mem_rawIssues (input : Input) (issue : Issue) :
    issue ∈ rawIssues input ↔ RequiredIssue input issue := by
  rw [rawIssues, List.mem_flatMap]
  constructor
  · rintro ⟨format, formatMem, issueMem⟩
    exact (mem_formatIssues input format issue).mp issueMem |>.2
  · intro required
    exact ⟨issue.packageFormat, mem_allFormats _,
      (mem_formatIssues input issue.packageFormat issue).mpr ⟨rfl, required⟩⟩

@[simp] theorem mem_issues (input : Input) (issue : Issue) :
    issue ∈ issues input ↔ RequiredIssue input issue := by
  simp [issues, mem_rawIssues]

private theorem check_accepted_iff (input : Input) :
    check input = .accepted ↔ issues input = [] := by
  cases result : issues input <;> simp [check, result]

private theorem rejected_list {input : Input} {output : NonemptyList Issue}
    (rejected : check input = .rejected output) : output.toList = issues input := by
  cases result : issues input with
  | nil => simp [check, result] at rejected
  | cons head tail =>
    simp [check, result] at rejected
    cases rejected
    rfl

private theorem issue_rejected (input : Input) (issue : Issue) :
    issue ∈ issues input ↔
      ∃ output, check input = .rejected output ∧ issue ∈ output.toList := by
  constructor
  · intro member
    cases result : issues input with
    | nil => simp [result] at member
    | cons head tail =>
      refine ⟨⟨head, tail⟩, ?_, ?_⟩
      · simp [check, result]
      · rw [result] at member
        simpa [NonemptyList.toList] using member
  · rintro ⟨output, rejected, member⟩
    rw [rejected_list rejected] at member
    exact member

private theorem formatKey_injective {left right : Catalog.PackageFormat}
    (equal : FormatKey left = FormatKey right) : left = right := by
  cases left <;> cases right <;> simp_all [FormatKey]

private theorem issueKey_injective {left right : Issue}
    (equal : IssueKey left = IssueKey right) : left = right := by
  cases left <;> cases right <;> simp [IssueKey] at equal
  all_goals
    cases formatKey_injective equal
    rfl

private theorem no_required_of_accepted (input : Input)
    (accepted : check input = .accepted) :
    ∀ issue, ¬ RequiredIssue input issue := by
  have absent := (check_accepted_iff input).mp accepted
  intro issue required
  have member := (mem_issues input issue).mpr required
  rw [absent] at member
  simp at member

private theorem countFormat_perm {left right : List PackageDescriptor}
    (permutation : left.Perm right) (format : Catalog.PackageFormat) :
    countFormat left format = countFormat right format := by
  exact permutation.countP_eq (fun artifact => artifact.format == format)

private theorem exists_mem_perm {left right : List PackageDescriptor}
    (permutation : left.Perm right) (predicate : PackageDescriptor → Prop) :
    (∃ artifact ∈ left, predicate artifact) ↔
      ∃ artifact ∈ right, predicate artifact := by
  constructor
  · rintro ⟨artifact, member, property⟩
    exact ⟨artifact, permutation.mem_iff.mp member, property⟩
  · rintro ⟨artifact, member, property⟩
    exact ⟨artifact, permutation.mem_iff.mpr member, property⟩

namespace Proofs

theorem E1_accepted_packages_exact : E1_accepted_packages_exact model := by
  intro input accepted
  have noRequired := no_required_of_accepted input accepted
  constructor
  · intro format digest declared
    have notMissing := noRequired (.missingPackage format)
    have notDuplicate := noRequired (.duplicatePackage format)
    by_cases empty : countFormat input.artifacts format = 0
    · exact False.elim (notMissing ⟨⟨digest, declared⟩, empty⟩)
    · have notMany : ¬ 1 < countFormat input.artifacts format := by
        intro many
        exact notDuplicate many
      omega
  · intro artifact member
    have pluginMatches : artifact.plugin = input.plugin := by
      by_cases pluginSame : artifact.plugin = input.plugin
      · exact pluginSame
      · exact False.elim (noRequired (.pluginMismatch artifact.format)
          ⟨artifact, member, rfl, pluginSame⟩)
    have versionMatches : artifact.version = input.version := by
      by_cases versionSame : artifact.version = input.version
      · exact versionSame
      · exact False.elim (noRequired (.versionMismatch artifact.format)
          ⟨artifact, member, rfl, versionSame⟩)
    have packageDeclared :
        ∃ digest, Catalog.FormatDigest input.packages artifact.format digest := by
      by_cases present : ∃ digest, Catalog.FormatDigest input.packages artifact.format digest
      · exact present
      · exact False.elim (noRequired (.unexpectedPackage artifact.format)
          ⟨present, ⟨artifact, member, rfl⟩⟩)
    obtain ⟨digest, declared⟩ := packageDeclared
    have digestMatches : artifact.digest = digest := by
      by_cases digestSame : artifact.digest = digest
      · exact digestSame
      · exact False.elim (noRequired (.digestMismatch artifact.format)
          ⟨artifact, member, rfl, digest, declared, digestSame⟩)
    refine ⟨pluginMatches, versionMatches, ?_⟩
    simpa [digestMatches] using declared

theorem E2_complete_packages_accepted : E2_complete_packages_accepted model := by
  intro input realizes
  apply (check_accepted_iff input).mpr
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro issue member
  cases issue with
  | missingPackage format =>
    have required := (mem_issues input (.missingPackage format)).mp member
    obtain ⟨digest, declared⟩ := required.1
    have countZero : countFormat input.artifacts format = 0 := required.2
    have countOne := realizes.1 format digest declared
    omega
  | unexpectedPackage format =>
    have required := (mem_issues input (.unexpectedPackage format)).mp member
    obtain ⟨absent, artifact, artifactMember, formatMatches⟩ := required
    have artifactRealizes := realizes.2 artifact artifactMember
    exact absent ⟨artifact.digest, by simpa [formatMatches] using artifactRealizes.2.2⟩
  | duplicatePackage format =>
    have required := (mem_issues input (.duplicatePackage format)).mp member
    have many : 1 < countFormat input.artifacts format := required
    obtain ⟨artifact, artifactMember, formatMatches⟩ :=
      (exists_format_mem_iff input.artifacts format).mpr
        (Nat.lt_trans (by decide : 0 < 1) many)
    have artifactRealizes := realizes.2 artifact artifactMember
    have declared : Catalog.FormatDigest input.packages format artifact.digest := by
      simpa [formatMatches] using artifactRealizes.2.2
    have countOne := realizes.1 format artifact.digest declared
    omega
  | pluginMismatch format =>
    have required := (mem_issues input (.pluginMismatch format)).mp member
    obtain ⟨artifact, artifactMember, formatMatches, mismatch⟩ := required
    have artifactRealizes := realizes.2 artifact artifactMember
    exact mismatch (by simpa [formatMatches] using artifactRealizes.1)
  | versionMismatch format =>
    have required := (mem_issues input (.versionMismatch format)).mp member
    obtain ⟨artifact, artifactMember, formatMatches, mismatch⟩ := required
    have artifactRealizes := realizes.2 artifact artifactMember
    exact mismatch (by simpa [formatMatches] using artifactRealizes.2.1)
  | digestMismatch format =>
    have required := (mem_issues input (.digestMismatch format)).mp member
    obtain ⟨artifact, artifactMember, formatMatches, digest, declared, mismatch⟩ := required
    have artifactRealizes := realizes.2 artifact artifactMember
    have artifactDeclared : Catalog.FormatDigest input.packages format artifact.digest := by
      simpa [formatMatches] using artifactRealizes.2.2
    exact mismatch (formatDigest_unique input.packages format digest artifact.digest
      declared artifactDeclared).symm

theorem E3_diagnostics_exact : E3_diagnostics_exact model := by
  refine ⟨?_, ?_⟩
  · intro input issue
    exact (mem_issues input issue).symm.trans (issue_rejected input issue)
  · intro input output rejected
    rw [rejected_list rejected]
    apply List.pairwise_map.mpr
    apply Compiler.ordered_strict
    apply (Compiler.unique_nodup _).imp
    intro left right distinct sameKey
    exact distinct (issueKey_injective sameKey)

theorem E4_enumeration_invariant : E4_enumeration_invariant model := by
  intro input artifacts permutation
  have countSame : ∀ format,
      countFormat input.artifacts format = countFormat artifacts format :=
    fun format => countFormat_perm permutation format
  have existsSame : ∀ predicate : PackageDescriptor → Prop,
      (∃ artifact ∈ input.artifacts, predicate artifact) ↔
        ∃ artifact ∈ artifacts, predicate artifact :=
    fun predicate => exists_mem_perm permutation predicate
  have requiredSame : ∀ issue,
      RequiredIssue input issue ↔ RequiredIssue { input with artifacts := artifacts } issue := by
    intro issue
    cases issue with
    | missingPackage format =>
      simp only [RequiredIssue]
      constructor
      · rintro ⟨present, count⟩
        exact ⟨present, by
          calc
            countFormat artifacts format = countFormat input.artifacts format := (countSame format).symm
            _ = 0 := count⟩
      · rintro ⟨present, count⟩
        exact ⟨present, by
          calc
            countFormat input.artifacts format = countFormat artifacts format := countSame format
            _ = 0 := count⟩
    | unexpectedPackage format =>
      simp only [RequiredIssue]
      constructor
      · rintro ⟨absent, present⟩
        exact ⟨absent, (existsSame fun artifact => artifact.format = format).mp present⟩
      · rintro ⟨absent, present⟩
        exact ⟨absent, (existsSame fun artifact => artifact.format = format).mpr present⟩
    | duplicatePackage format =>
      simp only [RequiredIssue]
      constructor
      · intro count
        rw [← countSame format]
        exact count
      · intro count
        rw [countSame format]
        exact count
    | pluginMismatch format =>
      simp only [RequiredIssue]
      exact existsSame fun artifact => artifact.format = format ∧ artifact.plugin ≠ input.plugin
    | versionMismatch format =>
      simp only [RequiredIssue]
      exact existsSame fun artifact => artifact.format = format ∧ artifact.version ≠ input.version
    | digestMismatch format =>
      simp only [RequiredIssue]
      exact existsSame fun artifact =>
        artifact.format = format ∧ ∃ digest,
          Catalog.FormatDigest input.packages format digest ∧ artifact.digest ≠ digest
  have issueMembersSame : ∀ issue,
      issue ∈ rawIssues input ↔
        issue ∈ rawIssues { input with artifacts := artifacts } := by
    intro issue
    rw [mem_rawIssues, mem_rawIssues]
    exact requiredSame issue
  change check input = check { input with artifacts := artifacts }
  have sameIssues : issues input = issues { input with artifacts := artifacts } := by
    apply Compiler.ordered_unique_eq IssueKey (rawIssues input)
      (rawIssues { input with artifacts := artifacts }) issueMembersSame
    intro left right equal
    exact issueKey_injective equal
  simp only [check, sameIssues]

end Proofs
end PluginSdk.Catalog.Artifacts
