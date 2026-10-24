import PluginSdk.Distribution.Planning.Model
import PluginSdk.Distribution.Planning.Properties

namespace PluginSdk.Distribution.Planning

private def ProjectionCount {α β : Type} [DecidableEq β] (values : List α)
    (project : α → β) (key : β) : Nat :=
  values.countP (fun value => project value == key)

private theorem projectionCount_cons {α β : Type} [DecidableEq β]
    (head : α) (tail : List α) (project : α → β) (key : β) :
    ProjectionCount (head :: tail) project key =
      (if project head = key then 1 else 0) + ProjectionCount tail project key := by
  by_cases equal : project head = key <;>
    simp [ProjectionCount, equal] <;> omega

private theorem projectionCount_tail_le {α β : Type} [DecidableEq β]
    (head : α) (tail : List α) (project : α → β) (key : β) :
    ProjectionCount tail project key ≤ ProjectionCount (head :: tail) project key := by
  rw [projectionCount_cons]
  by_cases equal : project head = key <;> simp [equal] <;> omega

private theorem projectionMap_mem_iff_count_pos {α β : Type} [DecidableEq β]
    (values : List α) (project : α → β) (key : β) :
    key ∈ values.map project ↔ 0 < ProjectionCount values project key := by
  simp only [ProjectionCount, List.countP_pos_iff, List.mem_map]
  constructor
  · rintro ⟨value, member, equal⟩
    exact ⟨value, member, by simp [equal]⟩
  · rintro ⟨value, member, matchFacts⟩
    have equal : project value = key := by simpa using matchFacts
    exact ⟨value, member, equal⟩

private theorem projectionMap_nodup_of_count_le_one {α β : Type} [DecidableEq β]
    (values : List α) (project : α → β)
    (atMost : ∀ key, ProjectionCount values project key ≤ 1) :
    (values.map project).Nodup := by
  induction values with
  | nil => simp
  | cons head tail ih =>
    rw [List.map_cons, List.nodup_cons]
    constructor
    · intro member
      have tailPositive := (projectionMap_mem_iff_count_pos tail project (project head)).mp member
      have fullAtMost := atMost (project head)
      rw [projectionCount_cons] at fullAtMost
      simp at fullAtMost
      omega
    · apply ih
      intro key
      have tailLe := projectionCount_tail_le head tail project key
      have fullAtMost := atMost key
      omega

private theorem projectionCount_le_one_of_map_nodup {α β : Type} [DecidableEq β]
    (values : List α) (project : α → β) (key : β)
    (nodup : (values.map project).Nodup) : ProjectionCount values project key ≤ 1 := by
  induction values with
  | nil => simp [ProjectionCount]
  | cons head tail ih =>
    have pair := List.nodup_cons.mp nodup
    by_cases equal : project head = key
    · subst key
      have noTailMember : project head ∉ tail.map project := pair.1
      have noTailCount : ProjectionCount tail project (project head) = 0 := by
        have noPositive : ¬ 0 < ProjectionCount tail project (project head) := fun positive =>
          noTailMember ((projectionMap_mem_iff_count_pos tail project (project head)).mpr positive)
        omega
      rw [projectionCount_cons]
      simp [noTailCount]
    · have tailAtMost := ih pair.2
      rw [projectionCount_cons]
      simp [equal]
      exact tailAtMost

private theorem target_mem_map_iff_count_pos (input : List Candidate) (target : TargetId) :
    target ∈ input.map CandidateTarget ↔ 0 < CountTarget input target := by
  simp only [CountTarget, List.countP_pos_iff, List.mem_map]
  constructor
  · rintro ⟨candidate, member, equal⟩
    exact ⟨candidate, member, by simp [equal]⟩
  · rintro ⟨candidate, member, matchFacts⟩
    have equal : CandidateTarget candidate = target := by simpa using matchFacts
    exact ⟨candidate, member, equal⟩

private theorem mem_repeatedTargets (input : List Candidate) (target : TargetId) :
    target ∈ RepeatedTargets input ↔ 1 < CountTarget input target := by
  simp only [RepeatedTargets, List.mem_filter, decide_eq_true_eq]
  rw [target_mem_map_iff_count_pos]
  constructor
  · exact fun ⟨_, repeated⟩ => repeated
  · intro repeated
    exact ⟨by omega, repeated⟩

private theorem installation_mem_map_iff_count_pos
    (steps : List StepDescriptor) (installation : InstallationKey) :
    installation ∈ steps.map (·.installation) ↔
      0 < steps.countP (fun step => step.installation == installation) := by
  simp only [List.countP_pos_iff, List.mem_map]
  constructor
  · rintro ⟨step, member, equal⟩
    exact ⟨step, member, by simp [equal]⟩
  · rintro ⟨step, member, matchFacts⟩
    have equal : step.installation = installation := by simpa using matchFacts
    exact ⟨step, member, equal⟩

private theorem mem_repeatedInstallations (input : List Candidate)
    (installation : InstallationKey) :
    installation ∈ RepeatedInstallations input ↔
      1 < CountInstallation input installation := by
  simp only [RepeatedInstallations, List.mem_filter, decide_eq_true_eq]
  rw [installation_mem_map_iff_count_pos]
  constructor
  · exact fun ⟨_, repeated⟩ => repeated
  · intro repeated
    have repeatedCount :
        1 < (ReadySteps input).countP (fun step => step.installation == installation) := by
      simpa [CountInstallation] using repeated
    exact ⟨by omega, repeated⟩

private theorem mem_blockedCandidates (input : List Candidate) (target : TargetId)
    (reason : Failure) :
    Issue.blocked target reason ∈ BlockedCandidates input ↔
      Candidate.blocked target reason ∈ input := by
  simp only [BlockedCandidates, List.mem_filterMap]
  constructor
  · rintro ⟨candidate, member, mapped⟩
    cases candidate with
    | ready step => simp at mapped
    | blocked otherTarget otherReason =>
      injection mapped with equal
      cases equal
      exact member
  · intro member
    exact ⟨.blocked target reason, member, rfl⟩

private theorem no_duplicateTarget_in_blockedCandidates (input : List Candidate)
    (target : TargetId) :
    Issue.duplicateTarget target ∉ BlockedCandidates input := by
  intro member
  simp only [BlockedCandidates, List.mem_filterMap] at member
  rcases member with ⟨candidate, _, mapped⟩
  cases candidate with
  | ready step => simp at mapped
  | blocked otherTarget reason => simp at mapped

private theorem no_duplicateInstallation_in_blockedCandidates (input : List Candidate)
    (installation : InstallationKey) :
    Issue.duplicateInstallation installation ∉ BlockedCandidates input := by
  intro member
  simp only [BlockedCandidates, List.mem_filterMap] at member
  rcases member with ⟨candidate, _, mapped⟩
  cases candidate with
  | ready step => simp at mapped
  | blocked otherTarget reason => simp at mapped

private theorem mem_issueCandidates (input : List Candidate) (issue : Issue) :
    issue ∈ IssueCandidates input ↔ RequiredIssue input issue := by
  cases issue with
  | blocked target reason =>
    simp [IssueCandidates, RequiredIssue, mem_blockedCandidates]
  | duplicateTarget target =>
    simp [IssueCandidates, RequiredIssue, mem_repeatedTargets,
      no_duplicateTarget_in_blockedCandidates]
  | duplicateInstallation installation =>
    simp [IssueCandidates, RequiredIssue, mem_repeatedInstallations,
      no_duplicateInstallation_in_blockedCandidates]

private theorem mem_issues (input : List Candidate) (issue : Issue) :
    issue ∈ PlanningIssues input ↔ RequiredIssue input issue := by
  simp [PlanningIssues, mem_issueCandidates]

private theorem no_required_of_empty_issues (input : List Candidate)
    (empty : PlanningIssues input = []) : ∀ issue, ¬ RequiredIssue input issue := by
  intro issue required
  have member := (mem_issues input issue).2 required
  rw [empty] at member
  simp at member

private theorem fullyReady_of_no_blocked (input : List Candidate)
    (noBlocked : ∀ target reason, ¬ Candidate.blocked target reason ∈ input) :
    FullyReady input := by
  intro candidate member
  cases candidate with
  | ready step => exact ⟨step, rfl⟩
  | blocked target reason => exact False.elim (noBlocked target reason member)

private theorem countTarget_cons (head : Candidate) (tail : List Candidate)
    (target : TargetId) :
    CountTarget (head :: tail) target =
      (if CandidateTarget head = target then 1 else 0) + CountTarget tail target := by
  simpa [CountTarget, ProjectionCount] using projectionCount_cons head tail CandidateTarget target

private theorem candidateTargets_nodup_of_no_required (input : List Candidate)
    (noRequired : ∀ issue, ¬ RequiredIssue input issue) :
    (input.map CandidateTarget).Nodup := by
  apply projectionMap_nodup_of_count_le_one input CandidateTarget
  intro target
  by_cases atMost : ProjectionCount input CandidateTarget target ≤ 1
  · exact atMost
  · have manyCount : 1 < ProjectionCount input CandidateTarget target := by omega
    have many : 1 < CountTarget input target := by
      simpa [ProjectionCount, CountTarget] using manyCount
    exact False.elim (noRequired (.duplicateTarget target) many)

private theorem readyInstallations_nodup_of_no_required (input : List Candidate)
    (noRequired : ∀ issue, ¬ RequiredIssue input issue) :
    ((ReadySteps input).map (·.installation)).Nodup := by
  apply projectionMap_nodup_of_count_le_one (ReadySteps input) (·.installation)
  intro installation
  by_cases atMost : ProjectionCount (ReadySteps input) (·.installation) installation ≤ 1
  · exact atMost
  · have manyCount :
        1 < ProjectionCount (ReadySteps input) (·.installation) installation := by omega
    have many : 1 < CountInstallation input installation := by
      simpa [ProjectionCount, CountInstallation] using manyCount
    exact False.elim (noRequired (.duplicateInstallation installation) many)

private theorem ready_candidate_mem (input : List Candidate) (step : StepDescriptor) :
    step ∈ ReadySteps input ↔ Candidate.ready step ∈ input := by
  constructor
  · intro member
    simp only [ReadySteps, List.mem_filterMap] at member
    rcases member with ⟨candidate, candidateMember, mapped⟩
    cases candidate with
    | ready other =>
      injection mapped with equal
      cases equal
      exact candidateMember
    | blocked target reason => simp at mapped
  · intro member
    simp only [ReadySteps, List.mem_filterMap]
    exact ⟨Candidate.ready step, member, rfl⟩

private theorem readyStepKeys_injective (input : List Candidate)
    (targetsNodup : (input.map CandidateTarget).Nodup) :
    ∀ left ∈ ReadySteps input, ∀ right ∈ ReadySteps input,
      StepKey left = StepKey right → left = right := by
  have targetPairwise : input.Pairwise (fun left right => CandidateTarget left ≠ CandidateTarget right) :=
    List.pairwise_map.mp (List.nodup_iff_pairwise_ne.mp targetsNodup)
  have targetInjective := Compiler.key_injective_on CandidateTarget targetPairwise
  intro left leftMember right rightMember keyEqual
  have leftCandidate := (ready_candidate_mem input left).mp leftMember
  have rightCandidate := (ready_candidate_mem input right).mp rightMember
  have labelEqual : left.target.value = right.target.value := by
    have keyAsList : [left.target.value] = [right.target.value] := by
      simpa [StepKey] using keyEqual
    simpa using keyAsList
  have targetEqual : left.target = right.target := congrArg TargetId.mk labelEqual
  have candidateEqual : Candidate.ready left = Candidate.ready right :=
    targetInjective (Candidate.ready left) leftCandidate (Candidate.ready right) rightCandidate
      (by simpa [CandidateTarget] using targetEqual)
  injection candidateEqual

private theorem normalize_ready_facts {input : NonemptyList Candidate}
    {steps : NonemptyList StepDescriptor} (accepted : normalize input = .ready steps) :
    PlanningIssues input.toList = [] ∧ steps.toList = OrderedReadySteps input.toList := by
  by_cases empty : PlanningIssues input.toList = []
  · have resultEqual : Compiler.nonempty (OrderedReadySteps input.toList)
        (readySteps_nonempty_of_no_issues input empty) = steps := by
      simpa [normalize, empty] using accepted
    refine ⟨empty, ?_⟩
    rw [← resultEqual]
    exact Compiler.nonempty_toList _ _
  · simp [normalize, empty] at accepted

private theorem normalize_blocked_list {input : NonemptyList Candidate}
    {issues : NonemptyList Issue} (blocked : normalize input = .blocked issues) :
    issues.toList = PlanningIssues input.toList := by
  by_cases empty : PlanningIssues input.toList = []
  · simp [normalize, empty] at blocked
  · have resultEqual : Compiler.nonempty (PlanningIssues input.toList) empty = issues := by
      simpa [normalize, empty] using blocked
    have listEqual := congrArg NonemptyList.toList resultEqual
    exact listEqual.symm.trans (Compiler.nonempty_toList _ _)

private theorem readySteps_ordered_target (input : List Candidate)
    (targetsNodup : (input.map CandidateTarget).Nodup) :
    (OrderedReadySteps input).Pairwise
      (fun left right => Utf8Before left.target.value right.target.value) := by
  have distinct : (ReadySteps input).Pairwise (fun left right => StepKey left ≠ StepKey right) := by
    induction input with
    | nil => simp [ReadySteps]
    | cons candidate tail ih =>
      have targetParts := List.nodup_cons.mp targetsNodup
      cases candidate with
      | blocked target reason =>
        simpa [ReadySteps] using ih targetParts.2
      | ready step =>
        have tailDistinct := ih targetParts.2
        rw [ReadySteps]
        apply List.pairwise_cons.mpr
        constructor
        · intro other otherMember keyEqual
          have otherCandidate := (ready_candidate_mem tail other).mp otherMember
          have otherTarget : CandidateTarget (Candidate.ready step) ∈ tail.map CandidateTarget := by
            apply List.mem_map.mpr
            refine ⟨Candidate.ready other, otherCandidate, ?_⟩
            have labelEqual : step.target.value = other.target.value := by
              have keyAsList : [step.target.value] = [other.target.value] := by
                simpa [StepKey] using keyEqual
              simpa using keyAsList
            exact (congrArg TargetId.mk labelEqual).symm
          exact targetParts.1 otherTarget
        · exact tailDistinct
  have sorted := Compiler.ordered_strict StepKey (ReadySteps input) distinct
  exact sorted.imp (fun less =>
    (List.cons_lex_cons_iff.mp less).elim id
      (fun ⟨_, impossible⟩ => False.elim (List.not_lex_nil impossible)))

private theorem readySteps_perm {left right : List Candidate}
    (permutation : left.Perm right) : (ReadySteps left).Perm (ReadySteps right) := by
  exact permutation.filterMap (fun candidate =>
    match candidate with
    | .ready step => some step
    | .blocked _ _ => none)

private theorem countTarget_perm {left right : List Candidate}
    (permutation : left.Perm right) (target : TargetId) :
    CountTarget left target = CountTarget right target := by
  exact permutation.countP_eq (fun candidate => CandidateTarget candidate == target)

private theorem countInstallation_perm {left right : List Candidate}
    (permutation : left.Perm right) (installation : InstallationKey) :
    CountInstallation left installation = CountInstallation right installation := by
  exact (readySteps_perm permutation).countP_eq
    (fun step => step.installation == installation)

private theorem requiredIssue_perm {left right : List Candidate}
    (permutation : left.Perm right) (issue : Issue) :
    RequiredIssue left issue ↔ RequiredIssue right issue := by
  cases issue with
  | blocked target reason =>
    simpa [RequiredIssue] using permutation.mem_iff
  | duplicateTarget target =>
    simp only [RequiredIssue]
    rw [countTarget_perm permutation target]
  | duplicateInstallation installation =>
    simp only [RequiredIssue]
    rw [countInstallation_perm permutation installation]

private theorem failureName_injective {left right : Failure}
    (equal : FailureName left = FailureName right) : left = right := by
  cases left <;> cases right <;> simp [FailureName] at equal <;> rfl

private theorem issueKey_injective {left right : Issue}
    (equal : IssueKey left = IssueKey right) : left = right := by
  cases left with
  | blocked leftTarget leftReason =>
    cases right with
    | blocked rightTarget rightReason =>
      simp [IssueKey] at equal
      rcases equal with ⟨targetValue, reasonName⟩
      have targetEqual : leftTarget = rightTarget := congrArg TargetId.mk targetValue
      have reasonEqual := failureName_injective reasonName
      cases targetEqual
      cases reasonEqual
      rfl
    | duplicateTarget target => simp [IssueKey] at equal
    | duplicateInstallation installation => simp [IssueKey] at equal
  | duplicateTarget leftTarget =>
    cases right with
    | blocked target reason => simp [IssueKey] at equal
    | duplicateTarget rightTarget =>
      simp [IssueKey] at equal
      have targetEqual : leftTarget = rightTarget := congrArg TargetId.mk equal
      cases targetEqual
      rfl
    | duplicateInstallation installation => simp [IssueKey] at equal
  | duplicateInstallation leftInstallation =>
    cases right with
    | blocked target reason => simp [IssueKey] at equal
    | duplicateTarget target => simp [IssueKey] at equal
    | duplicateInstallation rightInstallation =>
      simp [IssueKey] at equal
      have installationEqual : leftInstallation = rightInstallation :=
        congrArg InstallationKey.mk equal
      cases installationEqual
      rfl

private theorem planningIssues_perm {left right : List Candidate}
    (permutation : left.Perm right) : PlanningIssues left = PlanningIssues right := by
  unfold PlanningIssues
  apply Compiler.ordered_unique_eq IssueKey (IssueCandidates left) (IssueCandidates right)
  · intro issue
    rw [mem_issueCandidates, mem_issueCandidates]
    exact requiredIssue_perm permutation issue
  · intro left right equal
    exact issueKey_injective equal

namespace Proofs

theorem D1_accepted_steps_exact : D1_accepted_steps_exact model := by
  intro input steps accepted
  obtain ⟨empty, exactSteps⟩ := normalize_ready_facts accepted
  have noRequired := no_required_of_empty_issues input.toList empty
  have noBlocked : ∀ target reason,
      ¬ Candidate.blocked target reason ∈ input.toList := by
    intro target reason member
    exact noRequired (.blocked target reason) member
  have fullyReady := fullyReady_of_no_blocked input.toList noBlocked
  have targetsNodup := candidateTargets_nodup_of_no_required input.toList noRequired
  have targetOrder := readySteps_ordered_target input.toList targetsNodup
  have installationsNodup := readyInstallations_nodup_of_no_required input.toList noRequired
  have installationPerm :=
    (Compiler.ordered_perm StepKey (ReadySteps input.toList)).map (·.installation)
  have orderedInstallationsNodup := installationPerm.nodup_iff.mpr installationsNodup
  rw [exactSteps]
  refine ⟨Compiler.ordered_perm StepKey (ReadySteps input.toList), fullyReady, ?_,
    orderedInstallationsNodup⟩
  exact List.pairwise_map.mpr targetOrder

theorem D2_ready_destinations_accepted : D2_ready_destinations_accepted model := by
  intro input fullyReady targetsNodup installationsNodup
  have noRequired : ∀ issue, ¬ RequiredIssue input.toList issue := by
    intro issue
    cases issue with
    | blocked target reason =>
      intro member
      obtain ⟨step, equal⟩ := fullyReady (Candidate.blocked target reason) member
      cases equal
    | duplicateTarget target =>
      intro repeated
      have countAtMost := projectionCount_le_one_of_map_nodup
        input.toList CandidateTarget target targetsNodup
      have repeatedCount : 1 < ProjectionCount input.toList CandidateTarget target := by
        simpa [RequiredIssue, CountTarget, ProjectionCount] using repeated
      omega
    | duplicateInstallation installation =>
      intro repeated
      have countAtMost := projectionCount_le_one_of_map_nodup
        (ReadySteps input.toList) (·.installation) installation installationsNodup
      have repeatedCount :
          1 < ProjectionCount (ReadySteps input.toList) (·.installation) installation := by
        simpa [RequiredIssue, CountInstallation, ProjectionCount] using repeated
      omega
  have noIssues : PlanningIssues input.toList = [] := by
    apply List.eq_nil_iff_forall_not_mem.mpr
    intro issue member
    exact noRequired issue ((mem_issues input.toList issue).mp member)
  refine ⟨Compiler.nonempty (OrderedReadySteps input.toList)
    (readySteps_nonempty_of_no_issues input noIssues), ?_⟩
  simp [model, normalize, noIssues]

theorem D3_issues_exact : D3_issues_exact model := by
  refine ⟨?_, ?_⟩
  · intro input issue
    constructor
    · intro required
      cases normalized : model.normalize input with
      | ready steps =>
        have empty := (normalize_ready_facts normalized).1
        have member := (mem_issues input.toList issue).2 required
        rw [empty] at member
        simp at member
      | blocked issues =>
        have issueMember := (mem_issues input.toList issue).2 required
        have listEqual := normalize_blocked_list normalized
        rw [← listEqual] at issueMember
        exact ⟨issues, rfl, issueMember⟩
    · rintro ⟨issues, normalized, member⟩
      rw [normalize_blocked_list normalized] at member
      exact (mem_issues input.toList issue).1 member
  · intro input issues blocked
    rw [normalize_blocked_list blocked]
    apply List.pairwise_map.mpr
    apply Compiler.ordered_strict IssueKey
    apply (List.nodup_iff_pairwise_ne.mp (Compiler.unique_nodup (IssueCandidates input.toList))).imp
    intro left right different equal
    exact different (issueKey_injective equal)

theorem D4_enumeration_invariant : D4_enumeration_invariant model := by
  intro left right permutation
  have issuesEqual := planningIssues_perm permutation
  by_cases empty : PlanningIssues left.toList = []
  · have rightEmpty : PlanningIssues right.toList = [] := by
      rw [← issuesEqual]
      exact empty
    have noRequired := no_required_of_empty_issues left.toList empty
    have targetsNodup := candidateTargets_nodup_of_no_required left.toList noRequired
    have readyPermutation := readySteps_perm permutation
    have orderedReadyEqual : OrderedReadySteps left.toList = OrderedReadySteps right.toList := by
      unfold OrderedReadySteps
      apply Compiler.ordered_eq_of_perm StepKey readyPermutation
      intro leftStep leftMember rightStep rightMember keyEqual
      have rightCandidate := (ready_candidate_mem right.toList rightStep).mp rightMember
      have rightInLeft := permutation.mem_iff.mpr rightCandidate
      exact readyStepKeys_injective left.toList targetsNodup leftStep leftMember
        rightStep ((ready_candidate_mem left.toList rightStep).mpr rightInLeft) keyEqual
    change normalize left = normalize right
    simp [normalize, empty, rightEmpty, orderedReadyEqual]
  · have rightNonempty : PlanningIssues right.toList ≠ [] := by
      intro rightEmpty
      apply empty
      rw [issuesEqual]
      exact rightEmpty
    change normalize left = normalize right
    simp [normalize, rightNonempty, issuesEqual]

end Proofs

end PluginSdk.Distribution.Planning
