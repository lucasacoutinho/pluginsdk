import PluginSdk.Compiler.Process.Portable.Model
import PluginSdk.Compiler.Process.Facts

namespace PluginSdk.Compiler.Process.Portable.Proofs

private theorem mem_collisions (plan : Plan) (name : String) :
    Issue.environmentCollision name ∈ (destinationKeys plan).filterMap (fun candidate =>
      if 1 < (destinationKeys plan).count candidate then some (.environmentCollision candidate) else none) ↔
    1 < (destinationKeys plan).count name := by
  simp only [List.mem_filterMap]
  constructor
  · rintro ⟨candidate, _, result⟩
    by_cases collides : 1 < (destinationKeys plan).count candidate
    · simp [collides] at result
      rw [← result]
      exact collides
    · simp [collides] at result
  · intro collides
    exact ⟨name, List.count_pos_iff.mp (by omega), by simp [collides]⟩

private theorem no_reference_in_collisions (plan : Plan) (name : EnvironmentName) :
    Issue.environmentReferenceUnsupported name ∉ (destinationKeys plan).filterMap (fun candidate =>
      if 1 < (destinationKeys plan).count candidate then some (.environmentCollision candidate) else none) := by
  intro member
  obtain ⟨candidate, _, result⟩ := List.mem_filterMap.mp member
  split at result <;> simp_all

theorem mem_issues (input : Input) (issue : Issue) :
    issue ∈ issues input ↔ RequiredIssue input issue := by
  simp only [issues, mem_ordered, mem_unique, rawIssues, List.mem_append]
  cases issue with
  | environmentCollision name =>
    rw [mem_collisions]
    cases input.host <;> simp [RequiredIssue]
  | environmentReferenceUnsupported name =>
    simp only [no_reference_in_collisions, false_or]
    cases host : input.host <;>
      simp [host, RequiredIssue, Launcher.sourceNames]

theorem issues_empty_iff (input : Input) : issues input = [] ↔ Representable input := by
  constructor
  · intro absent
    constructor
    · apply List.nodup_iff_count.mpr
      intro name
      by_cases bounded : (destinationKeys input.plan).count name ≤ 1
      · exact bounded
      · have diagnostic := (mem_issues input (.environmentCollision name)).mpr (by
          change 1 < (destinationKeys input.plan).count name
          omega)
        simp [absent] at diagnostic
    · intro codex
      apply List.eq_nil_iff_forall_not_mem.mpr
      intro name member
      have diagnostic := (mem_issues input (.environmentReferenceUnsupported name)).mpr ⟨codex, member⟩
      simp [absent] at diagnostic
  · rintro ⟨distinct, references⟩
    apply List.eq_nil_iff_forall_not_mem.mpr
    intro issue member
    have required := (mem_issues input issue).mp member
    cases issue with
    | environmentCollision name =>
      have bounded := List.nodup_iff_count.mp distinct name
      change 1 < (destinationKeys input.plan).count name at required
      omega
    | environmentReferenceUnsupported name =>
      obtain ⟨codex, member⟩ := required
      simp [references codex] at member

theorem rendered_iff (input : Input) (program : Program) :
    model.build input = .rendered program ↔
      issues input = [] ∧ program = ⟨Captures.compile input.plan,
        native input (Captures.compile input.plan), Launcher.serialize (Captures.compile input.plan)⟩ := by
  change build input = .rendered program ↔ _
  cases problems : issues input <;> simp [build, problems, eq_comm]

theorem PL1_exact_admission : PL1_exact_admission model := by
  intro input
  simp only [rendered_iff]
  exact ⟨fun ⟨_, absent, _⟩ => (issues_empty_iff input).mp absent,
    fun valid => ⟨_, (issues_empty_iff input).mpr valid, rfl⟩⟩

theorem PL5_native_shape : PL5_native_shape model := by
  intro input program accepted
  obtain ⟨_, rfl⟩ := (rendered_iff input program).mp accepted
  exact ⟨rfl, rfl, rfl, rfl⟩

theorem PL6_posix_encoding : PL6_posix_encoding model := by
  intro input program accepted
  obtain ⟨_, rfl⟩ := (rendered_iff input program).mp accepted
  rfl

private theorem issueKey_injective (left right : Issue) (equal : IssueKey left = IssueKey right) :
    left = right := by
  cases left with
  | environmentCollision name =>
    cases right with
    | environmentCollision other =>
      exact congrArg Issue.environmentCollision (by simpa [IssueKey] using equal)
    | environmentReferenceUnsupported _ => simp [IssueKey] at equal
  | environmentReferenceUnsupported name =>
    cases right with
    | environmentCollision _ => simp [IssueKey] at equal
    | environmentReferenceUnsupported other =>
      exact congrArg Issue.environmentReferenceUnsupported
        (environmentName_eq_of_value_eq (by simpa [IssueKey] using equal))

theorem PL7_diagnostics : PL7_diagnostics model := by
  constructor
  · intro input issue
    rw [← mem_issues]
    cases problems : issues input with
    | nil => simp [model, build, problems]
    | cons head tail => simp [model, build, problems, NonemptyList.toList]
  · intro input problems rejected
    have same : problems.toList = issues input := by
      unfold model build at rejected
      cases found : issues input with
      | nil => simp [found] at rejected
      | cons head tail =>
        simp [found] at rejected
        subst problems
        rfl
    rw [same]
    apply ordered_strict
    have distinct := unique_nodup (rawIssues input)
    exact distinct.imp (fun {left right} different equal => different (issueKey_injective left right equal))

end PluginSdk.Compiler.Process.Portable.Proofs
