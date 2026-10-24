import PluginSdk.Distribution.Execution.Model
import PluginSdk.Distribution.Execution.Properties

namespace PluginSdk.Distribution.Execution.Proofs

private theorem pendingEntries_steps (steps : NonemptyList StepDescriptor) :
    (pendingEntries steps).toList.map (·.step) = steps.toList := by
  cases steps
  simp [pendingEntries, NonemptyList.toList, Function.comp_def]

private theorem pendingEntries_all_pending (steps : NonemptyList StepDescriptor) :
    ∀ entry ∈ (pendingEntries steps).toList, entry.status = .pending := by
  cases steps with
  | mk head tail =>
    intro entry member
    simp [pendingEntries, NonemptyList.toList] at member
    rcases member with rfl | ⟨step, _member, rfl⟩ <;> rfl

private theorem findEligible_sound (entries : List Entry) (visited : List TargetId)
    (entry : Entry) (found : findEligible entries visited = some entry) :
    entry ∈ entries ∧ Eligible entry visited := by
  induction entries with
  | nil => simp [findEligible] at found
  | cons head tail ih =>
    by_cases eligible : Eligible head visited
    · simp [findEligible, eligible] at found
      subst entry
      exact ⟨by simp, eligible⟩
    · simp [findEligible, eligible] at found
      obtain ⟨member, eligibleEntry⟩ := ih found
      exact ⟨by simp [member], eligibleEntry⟩

private theorem findEligible_complete (entries : List Entry) (visited : List TargetId)
    (eligibleExists : ∃ entry ∈ entries, Eligible entry visited) :
    ∃ entry, findEligible entries visited = some entry := by
  induction entries with
  | nil =>
    rcases eligibleExists with ⟨entry, member, _⟩
    simp at member
  | cons head tail ih =>
    by_cases headEligible : Eligible head visited
    · exact ⟨head, by simp [findEligible, headEligible]⟩
    · rcases eligibleExists with ⟨entry, member, eligible⟩
      simp only [List.mem_cons] at member
      rcases member with rfl | member
      · exact False.elim (headEligible eligible)
      · obtain ⟨selected, selectedFound⟩ := ih ⟨entry, member, eligible⟩
        exact ⟨selected, by simpa [findEligible, headEligible] using selectedFound⟩

private theorem findEligible_none_of_terminal (entries : List Entry)
    (visited : List TargetId)
    (terminal : ∀ entry ∈ entries, ¬ CanAttempt entry.status) :
    findEligible entries visited = none := by
  induction entries with
  | nil => rfl
  | cons head tail ih =>
    have headIneligible : ¬ Eligible head visited := by
      intro eligible
      exact terminal head (by simp) eligible.1
    simp [findEligible, headIneligible]
    apply ih
    intro entry member
    exact terminal entry (List.mem_cons_of_mem head member)

private theorem findTarget_member {entries : List Entry} {target : TargetId} {entry : Entry}
    (found : findTarget entries target = some entry) : entry ∈ entries := by
  apply List.mem_of_find?_eq_some
  simpa [findTarget] using found

private theorem findTarget_matches {entries : List Entry} {target : TargetId} {entry : Entry}
    (found : findTarget entries target = some entry) : entry.step.target = target := by
  have found' : entries.find? (fun candidate => candidate.step.target == target) = some entry := by
    simpa [findTarget] using found
  have selected := (List.find?_eq_some_iff_append.mp found').1
  simpa [beq_iff_eq] using selected

private theorem findTarget_exists (entries : List Entry) (target : TargetId)
    (entry : Entry) (member : entry ∈ entries) (targetEq : entry.step.target = target) :
    ∃ found, findTarget entries target = some found := by
  have resultNotNone : findTarget entries target ≠ none := by
    intro resultNone
    have noMatch : ∀ candidate ∈ entries, ¬ (candidate.step.target == target) :=
      List.find?_eq_none.mp (by simpa [findTarget] using resultNone)
    have selected : entry.step.target == target := by simp [targetEq]
    exact noMatch entry member selected
  cases found : findTarget entries target with
  | some selected => exact ⟨selected, rfl⟩
  | none => exact False.elim (resultNotNone found)

private theorem entry_eq_of_nodup_targets (entries : List Entry)
    (unique : (entries.map fun entry => entry.step.target).Nodup)
    (left right : Entry) (leftMember : left ∈ entries) (rightMember : right ∈ entries)
    (sameTarget : left.step.target = right.step.target) : left = right := by
  revert unique leftMember rightMember
  induction entries with
  | nil =>
    intro _ leftMember _
    simp at leftMember
  | cons head tail ih =>
    intro unique leftMember rightMember
    have ⟨headNotTail, tailUnique⟩ :
        head.step.target ∉ tail.map (fun entry => entry.step.target) ∧
          (tail.map fun entry => entry.step.target).Nodup := by
      simpa using unique
    simp only [List.mem_cons] at leftMember rightMember
    rcases leftMember with leftHead | leftTail
    · subst left
      rcases rightMember with rightHead | rightTail
      · subst right
        rfl
      · have targetInTail : head.step.target ∈ tail.map (fun entry => entry.step.target) :=
          List.mem_map.mpr ⟨right, rightTail, sameTarget.symm⟩
        exact False.elim (headNotTail targetInTail)
    · rcases rightMember with rightHead | rightTail
      · subst right
        have targetInTail : head.step.target ∈ tail.map (fun entry => entry.step.target) :=
          List.mem_map.mpr ⟨left, leftTail, sameTarget⟩
        exact False.elim (headNotTail targetInTail)
      · exact ih tailUnique leftTail rightTail

private theorem updateEntry_step (entry : Entry) (target : TargetId) (status : AttemptStatus) :
    (updateEntry entry target status).step = entry.step := by
  by_cases targetEq : entry.step.target = target <;> simp [updateEntry, targetEq]

private theorem updatedEntries_toList (entries : NonemptyList Entry) (target : TargetId)
    (status : AttemptStatus) :
    (updatedEntries entries target status).toList =
      entries.toList.map (fun entry => updateEntry entry target status) := by
  cases entries
  rfl

theorem X1_prior_open_requires_exact_binding :
    X1_prior_open_requires_exact_binding model := by
  intro plan prior record opened
  change openRecord ⟨plan, some prior⟩ = .opened record at opened
  cases binding : decide (BindingsMatch plan prior) with
  | false => simp [openRecord, binding] at opened
  | true =>
    have bindingMatch : BindingsMatch plan prior := of_decide_eq_true binding
    simp [openRecord, binding] at opened
    cases opened
    exact ⟨bindingMatch, rfl⟩

theorem X2_new_record_is_pending : X2_new_record_is_pending model := by
  intro plan
  let record : Progress := ⟨plan.id, plan.desired, pendingEntries plan.steps⟩
  refine ⟨record, ?_, ?_, ?_⟩
  · change openRecord ⟨plan, none⟩ = .opened record
    simp [openRecord, record]
  · exact ⟨rfl, rfl, pendingEntries_steps plan.steps⟩
  · intro entry member
    exact pendingEntries_all_pending plan.steps entry (by simpa [record] using member)

theorem X3_matching_prior_reopens : X3_matching_prior_reopens model := by
  intro plan prior bindingMatch
  change openRecord ⟨plan, some prior⟩ = .opened prior
  have binding : decide (BindingsMatch plan prior) = true := by simp [bindingMatch]
  simp [openRecord, binding]

theorem X4_scheduling_sound_complete : X4_scheduling_sound_complete model := by
  constructor
  · intro input step scheduled
    change schedule input = .attempt step at scheduled
    unfold schedule at scheduled
    cases found : findEligible input.record.entries.toList input.visited with
    | none => simp [found] at scheduled
    | some entry =>
      have stepMatches : entry.step = step := by simpa [found] using scheduled
      obtain ⟨member, eligible⟩ :=
        findEligible_sound input.record.entries.toList input.visited entry found
      exact ⟨entry, member, stepMatches, eligible⟩
  · intro input eligibleExists
    rcases eligibleExists with ⟨entry, member, eligible⟩
    obtain ⟨selected, found⟩ :=
      findEligible_complete input.record.entries.toList input.visited
        ⟨entry, member, eligible⟩
    refine ⟨selected.step, ?_⟩
    change schedule input = .attempt selected.step
    simp [schedule, found]

theorem X5_recording_preserves_review : X5_recording_preserves_review model := by
  intro input result recorded
  change record input = .recorded result at recorded
  cases found : findTarget input.record.entries.toList input.target with
  | none => simp [record, found] at recorded
  | some selected =>
    by_cases retryable : CanAttempt selected.status
    · simp [record, found, retryable] at recorded
      cases recorded
      refine ⟨rfl, rfl, ?_, ?_, ?_⟩
      · rw [updatedEntries_toList]
        simp [List.map_map, Function.comp_def, updateEntry_step]
      · exact ⟨selected, findTarget_member found, findTarget_matches found, retryable⟩
      · rw [updatedEntries_toList]
        rfl
    · have impossible : False := by simp [record, found, retryable] at recorded
      exact False.elim impossible

theorem X6_eligible_recording_succeeds : X6_eligible_recording_succeeds model := by
  intro input targetsUnique eligibleExists
  rcases eligibleExists with ⟨entry, member, eligible⟩
  have targetMatches : entry.step.target = input.target := eligible.1
  obtain ⟨_, targetExists⟩ :=
    findTarget_exists input.record.entries.toList input.target entry member targetMatches
  cases found : findTarget input.record.entries.toList input.target with
  | none =>
    rw [found] at targetExists
    contradiction
  | some selected =>
    have selectedMember := findTarget_member found
    have selectedMatches := findTarget_matches found
    have same := entry_eq_of_nodup_targets input.record.entries.toList targetsUnique
      selected entry selectedMember member (selectedMatches.trans targetMatches.symm)
    subst selected
    refine ⟨{ input.record with entries := updatedEntries input.record.entries input.target input.status }, ?_⟩
    change record input = .recorded _
    simp [record, found, eligible.2]

theorem X7_terminal_recording_rejected : X7_terminal_recording_rejected model := by
  intro input targetsUnique terminalExists
  rcases terminalExists with ⟨entry, member, targetMatches, terminal⟩
  obtain ⟨_, targetExists⟩ :=
    findTarget_exists input.record.entries.toList input.target entry member targetMatches
  cases found : findTarget input.record.entries.toList input.target with
  | none =>
    rw [found] at targetExists
    contradiction
  | some selected =>
    have selectedMember := findTarget_member found
    have selectedMatches := findTarget_matches found
    have same := entry_eq_of_nodup_targets input.record.entries.toList targetsUnique
      selected entry selectedMember member (selectedMatches.trans targetMatches.symm)
    subst selected
    change record input = .stepTerminal
    simp [record, found, terminal]

theorem X8_completion_exact : X8_completion_exact model := by
  intro record
  change summarize record = .complete ↔
    ∀ entry ∈ record.entries.toList, Satisfies record.desired entry.status
  simp [summarize, List.all_eq_true]

theorem X9_terminal_replay_schedules_nothing : X9_terminal_replay_schedules_nothing model := by
  intro input terminal
  change schedule input = .idle
  have noEligible :=
    findEligible_none_of_terminal input.record.entries.toList input.visited terminal
  simp [schedule, noEligible]

end PluginSdk.Distribution.Execution.Proofs
