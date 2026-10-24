import PluginSdk.Installer.Companions.Model
import PluginSdk.Installer.Companions.Properties

namespace PluginSdk.Installer.Companions

open PluginSdk.Compiler

private theorem roleName_ext {left right : RoleName} (equal : left.value = right.value) :
    left = right := by
  cases left
  cases right
  simp_all

private theorem nameKey_injective {left right : RoleName}
    (equal : NameKey left = NameKey right) : left = right := by
  apply roleName_ext
  simpa [NameKey] using equal

private theorem reasonName_injective {left right : Reason}
    (equal : ReasonName left = ReasonName right) : left = right := by
  cases left <;> cases right <;> simp [ReasonName] at equal <;> rfl

private theorem issueKey_injective {left right : Issue}
    (equal : IssueKey left = IssueKey right) : left = right := by
  cases left with
  | mk leftName leftReason =>
    cases right with
    | mk rightName rightReason =>
      have parts : leftName.value = rightName.value ∧
          ReasonName leftReason = ReasonName rightReason := by
        simpa [IssueKey] using equal
      have names : leftName = rightName := roleName_ext parts.1
      have reasons : leftReason = rightReason := reasonName_injective parts.2
      cases names
      cases reasons
      rfl

private theorem requiredNames_mem (input : Input) (name : RoleName) :
    name ∈ RequiredNames input ↔ RequiredName input name := by
  simp [RequiredNames, RequiredName]

private theorem mem_issuesForName (input : Input) (name : RoleName) (issue : Issue) :
    issue ∈ IssuesForName input name ↔ issue.name = name ∧ RequiredIssue input issue := by
  cases issue with
  | mk issueName reason =>
    by_cases namesEqual : issueName = name
    · subst issueName
      cases reason <;> simp [IssuesForName, PossibleReasons, decide_eq_true_eq]
    · simp [IssuesForName, PossibleReasons, namesEqual]

private theorem mem_issueCandidates (input : Input) (issue : Issue) :
    issue ∈ IssueCandidates input ↔ RequiredIssue input issue := by
  simp only [IssueCandidates, List.mem_flatMap, requiredNames_mem, mem_issuesForName]
  constructor
  · rintro ⟨name, requiredName, nameEqual, required⟩
    exact required
  · intro required
    exact ⟨issue.name, required.1, rfl, required⟩

private theorem mem_canonicalIssues (input : Input) (issue : Issue) :
    issue ∈ CanonicalIssues input ↔ RequiredIssue input issue := by
  simp [CanonicalIssues, mem_issueCandidates]

private theorem no_required_of_empty_issues (input : Input)
    (empty : CanonicalIssues input = []) :
    ∀ issue, ¬ RequiredIssue input issue := by
  intro issue required
  have member := (mem_canonicalIssues input issue).2 required
  rw [empty] at member
  simp at member

private theorem empty_issues_of_no_required (input : Input)
    (none : ∀ issue, ¬ RequiredIssue input issue) : CanonicalIssues input = [] := by
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro issue member
  exact none issue ((mem_canonicalIssues input issue).1 member)

private theorem fileName_of_mem_filter (files : List FileIdentity) (name : RoleName)
    {file : FileIdentity} (member : file ∈ files.filter (fun value => value.name == name)) :
    file.name = name := by
  simpa using (List.mem_filter.mp member).2

private theorem filterName_length_le_one_of_nodup (files : List FileIdentity)
    (namesNodup : (files.map (·.name)).Nodup) (name : RoleName) :
    (files.filter (fun file => file.name == name)).length ≤ 1 := by
  induction files with
  | nil => simp
  | cons head tail ih =>
    have nodupParts := List.nodup_cons.mp namesNodup
    by_cases headEq : head.name = name
    · have tailFilterEmpty : tail.filter (fun file => file.name == name) = [] := by
        apply List.eq_nil_iff_forall_not_mem.mpr
        intro file member
        have fileName := fileName_of_mem_filter tail name member
        have mapMember : head.name ∈ tail.map (·.name) := by
          apply List.mem_map.mpr
          exact ⟨file, (List.mem_filter.mp member).1, fileName.trans headEq.symm⟩
        exact nodupParts.1 mapMember
      simp [headEq, tailFilterEmpty]
    · have tailBound := ih nodupParts.2
      simp [headEq, tailBound]

private theorem names_nodup_of_filter_bound (files : List FileIdentity)
    (bound : ∀ name, (files.filter (fun file => file.name == name)).length ≤ 1) :
    (files.map (·.name)).Nodup := by
  induction files with
  | nil => simp
  | cons head tail ih =>
    rw [List.map_cons, List.nodup_cons]
    refine ⟨?_, ?_⟩
    · intro member
      obtain ⟨file, fileMem, equal⟩ := List.mem_map.mp member
      have tailFilterMember : file ∈ tail.filter (fun value => value.name == head.name) := by
        apply List.mem_filter.mpr
        refine ⟨fileMem, ?_⟩
        simp [equal.symm]
      have tailPositive : 0 < (tail.filter (fun value => value.name == head.name)).length := by
        cases filtered : tail.filter (fun value => value.name == head.name) with
        | nil => simp [filtered] at tailFilterMember
        | cons first rest => simp
      have fullBound := bound head.name
      have fullFilter :
          (head :: tail).filter (fun value => value.name == head.name) =
            head :: tail.filter (fun value => value.name == head.name) := by
        simp
      rw [fullFilter] at fullBound
      simp only [List.length_cons] at fullBound
      omega
    · apply ih
      intro name
      have fullBound := bound name
      by_cases headEq : head.name = name
      · have fullFilter :
            (head :: tail).filter (fun value => value.name == name) =
              head :: tail.filter (fun value => value.name == name) := by
          simp [headEq]
        rw [fullFilter] at fullBound
        simp only [List.length_cons] at fullBound
        omega
      · have fullFilter :
            (head :: tail).filter (fun value => value.name == name) =
              tail.filter (fun value => value.name == name) := by
          simp [headEq]
        rw [fullFilter] at fullBound
        exact fullBound

private theorem filter_name_mem_of_length_pos (files : List FileIdentity) (name : RoleName)
    (positive : 0 < (files.filter (fun file => file.name == name)).length) :
    name ∈ files.map (·.name) := by
  cases filtered : files.filter (fun file => file.name == name) with
  | nil => simp [filtered] at positive
  | cons head tail =>
    have member : head ∈ files.filter (fun file => file.name == name) := by simp [filtered]
    apply List.mem_map.mpr
    exact ⟨head, (List.mem_filter.mp member).1, fileName_of_mem_filter files name member⟩

private theorem filter_length_pos_of_name_mem (files : List FileIdentity) (name : RoleName)
    (member : name ∈ files.map (·.name)) :
    0 < (files.filter (fun file => file.name == name)).length := by
  obtain ⟨file, fileMember, nameEqual⟩ := List.mem_map.mp member
  have filterMember : file ∈ files.filter (fun value => value.name == name) := by
    apply List.mem_filter.mpr
    refine ⟨fileMember, ?_⟩
    simp [nameEqual]
  cases filtered : files.filter (fun value => value.name == name) with
  | nil => simp [filtered] at filterMember
  | cons head tail => simp

private theorem previous_length_le_one_of_no_required (input : Input)
    (none : ∀ issue, ¬ RequiredIssue input issue) (name : RoleName) :
    (Previous input name).length ≤ 1 := by
  by_cases atMost : (Previous input name).length ≤ 1
  · exact atMost
  have repeated : 1 < (Previous input name).length := by omega
  have requiredName : RequiredName input name := by
    apply Or.inl
    apply filter_name_mem_of_length_pos
    simpa [Previous] using (show 0 < (Previous input name).length by omega)
  exact False.elim (none ⟨name, .duplicatePrevious⟩ ⟨requiredName, repeated⟩)

private theorem desired_length_le_one_of_no_required (input : Input)
    (none : ∀ issue, ¬ RequiredIssue input issue) (name : RoleName) :
    (Desired input name).length ≤ 1 := by
  by_cases atMost : (Desired input name).length ≤ 1
  · exact atMost
  have repeated : 1 < (Desired input name).length := by omega
  have requiredName : RequiredName input name := by
    apply Or.inr
    apply filter_name_mem_of_length_pos
    simpa [Desired] using (show 0 < (Desired input name).length by omega)
  exact False.elim (none ⟨name, .duplicateDesired⟩ ⟨requiredName, repeated⟩)

private theorem observedName_of_member (input : Input) (name : RoleName)
    {file : ObservedFile} (member : file ∈ Observed input name) : file.name = name := by
  simpa using (List.mem_filter.mp member).2

private theorem singleton_of_length_one {α : Type} (values : List α)
    (lengthOne : values.length = 1) : ∃ value, values = [value] := by
  cases values with
  | nil => simp at lengthOne
  | cons head tail =>
    cases tail with
    | nil => exact ⟨head, rfl⟩
    | cons next rest => simp at lengthOne

private theorem safeBefore_of_no_required (input : Input)
    (none : ∀ issue, ¬ RequiredIssue input issue) (name : RoleName)
    (requiredName : RequiredName input name) : SafeBefore input name := by
  have previousBound := previous_length_le_one_of_no_required input none name
  have observedLength : (Observed input name).length = 1 := by
    by_cases one : (Observed input name).length = 1
    · exact one
    · exact False.elim (none ⟨name, .observationUnavailable⟩ ⟨requiredName, one⟩)
  obtain ⟨entry, entryEqual⟩ := singleton_of_length_one (Observed input name) observedLength
  have entryMember : entry ∈ Observed input name := by simp [entryEqual]
  have entryName := observedName_of_member input name entryMember
  cases entry with
  | mk entryRole observation =>
    have entryRoleEqual : entryRole = name := entryName
    subst entryRole
    cases previousEqual : Previous input name with
    | nil =>
      cases observation with
      | absent => exact Or.inl ⟨previousEqual, entryEqual⟩
      | file digest =>
        have unowned : UnsafeReason input name = some .unowned := by
          simp [UnsafeReason, previousEqual, entryEqual]
        exact False.elim (none ⟨name, .unowned⟩ ⟨requiredName, unowned⟩)
      | conflict =>
        have unowned : UnsafeReason input name = some .unowned := by
          simp [UnsafeReason, previousEqual, entryEqual]
        exact False.elim (none ⟨name, .unowned⟩ ⟨requiredName, unowned⟩)
      | unknown =>
        have unknownIssue : UnsafeReason input name = some .unknown := by
          simp [UnsafeReason, previousEqual, entryEqual]
        exact False.elim (none ⟨name, .unknown⟩ ⟨requiredName, unknownIssue⟩)
    | cons before tail =>
      cases tail with
      | nil =>
        have beforeMember : before ∈ Previous input name := by simp [previousEqual]
        have beforeName := fileName_of_mem_filter input.previous name (by simpa [Previous] using beforeMember)
        cases before with
        | mk beforeRole digest =>
          have beforeRoleEqual : beforeRole = name := beforeName
          subst beforeRole
          cases observation with
          | absent =>
            have drift : UnsafeReason input name = some .drift := by
              simp [UnsafeReason, previousEqual, entryEqual]
            exact False.elim (none ⟨name, .drift⟩ ⟨requiredName, drift⟩)
          | file observedDigest =>
            by_cases same : digest = observedDigest
            · subst observedDigest
              exact Or.inr ⟨digest, previousEqual, entryEqual⟩
            · have drift : UnsafeReason input name = some .drift := by
                simp [UnsafeReason, previousEqual, entryEqual, same]
              exact False.elim (none ⟨name, .drift⟩ ⟨requiredName, drift⟩)
          | conflict =>
            have unowned : UnsafeReason input name = some .unowned := by
              simp [UnsafeReason, previousEqual, entryEqual]
            exact False.elim (none ⟨name, .unowned⟩ ⟨requiredName, unowned⟩)
          | unknown =>
            have unknownIssue : UnsafeReason input name = some .unknown := by
              simp [UnsafeReason, previousEqual, entryEqual]
            exact False.elim (none ⟨name, .unknown⟩ ⟨requiredName, unknownIssue⟩)
      | cons next rest =>
        have bound := previousBound
        simp [previousEqual] at bound

private theorem names_nodup_of_no_required (input : Input)
    (none : ∀ issue, ¬ RequiredIssue input issue) :
    (input.previous.map (·.name)).Nodup ∧ (input.desired.map (·.name)).Nodup := by
  have previousBound : ∀ name, (input.previous.filter (fun file => file.name == name)).length ≤ 1 := by
    intro name
    simpa [Previous] using previous_length_le_one_of_no_required input none name
  have desiredBound : ∀ name, (input.desired.filter (fun file => file.name == name)).length ≤ 1 := by
    intro name
    simpa [Desired] using desired_length_le_one_of_no_required input none name
  exact ⟨names_nodup_of_filter_bound input.previous previousBound,
    names_nodup_of_filter_bound input.desired desiredBound⟩

private theorem safe_of_no_required (input : Input)
    (none : ∀ issue, ¬ RequiredIssue input issue) : Safe input := by
  refine ⟨(names_nodup_of_no_required input none).1,
    (names_nodup_of_no_required input none).2, ?_⟩
  intro name requiredName
  exact safeBefore_of_no_required input none name requiredName

private theorem safeBefore_unsafe_none (input : Input) (name : RoleName)
    (safeBefore : SafeBefore input name) : UnsafeReason input name = none := by
  rcases safeBefore with ⟨previous, observed⟩ | ⟨digest, previous, observed⟩
  · simp [UnsafeReason, previous, observed]
  · simp [UnsafeReason, previous, observed]

private theorem no_required_of_safe (input : Input) (safe : Safe input) :
    ∀ issue, ¬ RequiredIssue input issue := by
  rcases safe with ⟨previousNodup, desiredNodup, beforeSafe⟩
  intro issue required
  cases issue with
  | mk name reason =>
    rcases required with ⟨requiredName, predicate⟩
    cases reason with
    | duplicatePrevious =>
      have bound := filterName_length_le_one_of_nodup input.previous previousNodup name
      have repeated := predicate
      change 1 < (Previous input name).length at repeated
      have bound' : (Previous input name).length ≤ 1 := by simpa [Previous] using bound
      omega
    | duplicateDesired =>
      have bound := filterName_length_le_one_of_nodup input.desired desiredNodup name
      have repeated := predicate
      change 1 < (Desired input name).length at repeated
      have bound' : (Desired input name).length ≤ 1 := by simpa [Desired] using bound
      omega
    | observationUnavailable =>
      rcases beforeSafe name requiredName with ⟨_, observed⟩ | ⟨_, _, observed⟩
      · change (Observed input name).length ≠ 1 at predicate
        simp [observed] at predicate
      · change (Observed input name).length ≠ 1 at predicate
        simp [observed] at predicate
    | unowned =>
      have noUnsafe := safeBefore_unsafe_none input name (beforeSafe name requiredName)
      change UnsafeReason input name = some .unowned at predicate
      rw [noUnsafe] at predicate
      cases predicate
    | drift =>
      have noUnsafe := safeBefore_unsafe_none input name (beforeSafe name requiredName)
      change UnsafeReason input name = some .drift at predicate
      rw [noUnsafe] at predicate
      cases predicate
    | unknown =>
      have noUnsafe := safeBefore_unsafe_none input name (beforeSafe name requiredName)
      change UnsafeReason input name = some .unknown at predicate
      rw [noUnsafe] at predicate
      cases predicate

private theorem requiredNames_nodup (input : Input) : (RequiredNames input).Nodup := by
  unfold RequiredNames
  exact (ordered_perm NameKey (unique (input.previous.map (·.name) ++
    input.desired.map (·.name)))).nodup_iff.mpr (unique_nodup _)

private theorem requiredNames_sorted (input : Input) :
    (RequiredNames input).Pairwise (fun left right => Utf8Before left.value right.value) := by
  have distinct : (unique (input.previous.map (·.name) ++ input.desired.map (·.name))).Pairwise
      (fun left right => NameKey left ≠ NameKey right) := by
    apply (List.nodup_iff_pairwise_ne.mp (unique_nodup _)).imp
    intro left right different equal
    exact different (nameKey_injective equal)
  have strict := ordered_strict NameKey
    (unique (input.previous.map (·.name) ++ input.desired.map (·.name))) distinct
  unfold RequiredNames
  exact strict.imp (fun less =>
    (List.cons_lex_cons_iff.mp less).elim id
      (fun ⟨_, impossible⟩ => False.elim (List.not_lex_nil impossible)))

private theorem issueCandidates_key_distinct (input : Input) :
    (unique (IssueCandidates input)).Pairwise (fun left right => IssueKey left ≠ IssueKey right) := by
  apply (List.nodup_iff_pairwise_ne.mp (unique_nodup (IssueCandidates input))).imp
  intro left right different equal
  exact different (issueKey_injective equal)

private theorem canonicalIssues_sorted (input : Input) :
    (CanonicalIssues input).Pairwise (fun left right => KeyBefore (IssueKey left) (IssueKey right)) := by
  exact ordered_strict IssueKey (unique (IssueCandidates input)) (issueCandidates_key_distinct input)

private theorem review_ready_facts {input : Input} {changes : List Change}
    (accepted : reviewInput input = .ready changes) :
    CanonicalIssues input = [] ∧ changes = CanonicalChanges input := by
  by_cases empty : CanonicalIssues input = []
  · simp [reviewInput, empty] at accepted
    exact ⟨empty, accepted.symm⟩
  · simp [reviewInput, empty] at accepted

private theorem review_blocked_list {input : Input} {issues : NonemptyList Issue}
    (blocked : reviewInput input = .blocked issues) : issues.toList = CanonicalIssues input := by
  by_cases empty : CanonicalIssues input = []
  · simp [reviewInput, empty] at blocked
  · simp [reviewInput, empty] at blocked
    have listEqual := congrArg NonemptyList.toList blocked
    simpa [Compiler.nonempty_toList] using listEqual.symm

private theorem planChange_exact_of_no_required (input : Input)
    (none : ∀ issue, ¬ RequiredIssue input issue) (name : RoleName)
    (requiredName : RequiredName input name) :
    ∃ change, PlanChange input name = some change ∧ ExpectedChange input change := by
  have previousBound := previous_length_le_one_of_no_required input none name
  have desiredBound := desired_length_le_one_of_no_required input none name
  cases previousEqual : Previous input name with
  | nil =>
    cases desiredEqual : Desired input name with
    | nil =>
      rcases requiredName with previousMember | desiredMember
      · have positive := filter_length_pos_of_name_mem input.previous name previousMember
        have positive' : 0 < (Previous input name).length := by
          simpa [Previous] using positive
        have impossible : False := by rw [previousEqual] at positive'; simp at positive'
        exact False.elim impossible
      · have positive := filter_length_pos_of_name_mem input.desired name desiredMember
        have positive' : 0 < (Desired input name).length := by
          simpa [Desired] using positive
        have impossible : False := by rw [desiredEqual] at positive'; simp at positive'
        exact False.elim impossible
    | cons after afterTail =>
      cases afterTail with
      | nil =>
        have afterMember : after ∈ Desired input name := by simp [desiredEqual]
        have afterName := fileName_of_mem_filter input.desired name (by simpa [Desired] using afterMember)
        cases after with
        | mk role digest =>
          have roleEqual : role = name := afterName
          subst role
          refine ⟨.create name digest, ?_, ?_⟩
          · simp [PlanChange, previousEqual, desiredEqual]
          · simp [ExpectedChange, previousEqual, desiredEqual]
      | cons next rest =>
        have bound := desiredBound
        simp [desiredEqual] at bound
  | cons before beforeTail =>
    cases beforeTail with
    | nil =>
      have beforeMember : before ∈ Previous input name := by simp [previousEqual]
      have beforeName := fileName_of_mem_filter input.previous name
        (by simpa [Previous] using beforeMember)
      cases before with
      | mk role beforeDigest =>
        have roleEqual : role = name := beforeName
        subst role
        cases desiredEqual : Desired input name with
        | nil =>
          refine ⟨.remove name beforeDigest, ?_, ?_⟩
          · simp [PlanChange, previousEqual, desiredEqual]
          · simp [ExpectedChange, previousEqual, desiredEqual]
        | cons after afterTail =>
          cases afterTail with
          | nil =>
            have afterMember : after ∈ Desired input name := by simp [desiredEqual]
            have afterName := fileName_of_mem_filter input.desired name
              (by simpa [Desired] using afterMember)
            cases after with
            | mk afterRole afterDigest =>
              have afterRoleEqual : afterRole = name := afterName
              subst afterRole
              by_cases same : beforeDigest = afterDigest
              · refine ⟨.keep name beforeDigest, ?_, ?_⟩
                · simp [PlanChange, previousEqual, desiredEqual, same]
                · simp [ExpectedChange, previousEqual, desiredEqual, same]
              · refine ⟨.replace name beforeDigest afterDigest, ?_, ?_⟩
                · simp [PlanChange, previousEqual, desiredEqual, same]
                · simp [ExpectedChange, previousEqual, desiredEqual, same]
          | cons next rest =>
            have bound := desiredBound
            simp [desiredEqual] at bound
    | cons next rest =>
      have bound := previousBound
      simp [previousEqual] at bound

private theorem planChange_name {input : Input} {name : RoleName} {change : Change}
    (planned : PlanChange input name = some change) : change.name = name := by
  cases previous : Previous input name with
  | nil =>
    cases desired : Desired input name with
    | nil => simp [PlanChange, previous, desired] at planned
    | cons after afterTail =>
      cases afterTail with
      | nil =>
        cases after with
        | mk role digest =>
          cases change <;> simp [PlanChange, Change.name, previous, desired] at planned ⊢
          all_goals exact planned.1.symm
      | cons next rest => simp [PlanChange, previous, desired] at planned
  | cons before beforeTail =>
    cases beforeTail with
    | nil =>
      cases desired : Desired input name with
      | nil =>
        cases before with
        | mk role digest =>
          cases change <;> simp [PlanChange, Change.name, previous, desired] at planned ⊢
          all_goals exact planned.1.symm
      | cons after afterTail =>
        cases afterTail with
        | nil =>
          cases before with
          | mk previousRole previousDigest =>
            cases after with
            | mk desiredRole desiredDigest =>
              by_cases same : previousDigest = desiredDigest
              · cases change <;>
                  simp [PlanChange, Change.name, previous, desired, same] at planned ⊢
                all_goals exact planned.1.symm
              · cases change <;>
                  simp [PlanChange, Change.name, previous, desired, same] at planned ⊢
                all_goals exact planned.1.symm
        | cons next rest => simp [PlanChange, previous, desired] at planned
    | cons next rest => simp [PlanChange, previous] at planned

private theorem expected_change_required_and_plan (input : Input) (change : Change)
    (expected : ExpectedChange input change) :
    RequiredName input change.name ∧ PlanChange input change.name = some change := by
  cases change with
  | create name after =>
    rcases expected with ⟨previous, desired⟩
    have fileMember : (⟨name, after⟩ : FileIdentity) ∈ input.desired := by
      have filtered : (⟨name, after⟩ : FileIdentity) ∈ Desired input name := by
        rw [desired]
        simp
      simpa [Desired] using filtered
    refine ⟨Or.inr (List.mem_map.mpr ⟨⟨name, after⟩, fileMember, rfl⟩), ?_⟩
    simp [PlanChange, Change.name, previous, desired]
  | replace name before after =>
    rcases expected with ⟨different, previous, desired⟩
    have fileMember : (⟨name, before⟩ : FileIdentity) ∈ input.previous := by
      have filtered : (⟨name, before⟩ : FileIdentity) ∈ Previous input name := by
        rw [previous]
        simp
      simpa [Previous] using filtered
    refine ⟨Or.inl (List.mem_map.mpr ⟨⟨name, before⟩, fileMember, rfl⟩), ?_⟩
    simp [PlanChange, Change.name, previous, desired, different]
  | remove name before =>
    rcases expected with ⟨previous, desired⟩
    have fileMember : (⟨name, before⟩ : FileIdentity) ∈ input.previous := by
      have filtered : (⟨name, before⟩ : FileIdentity) ∈ Previous input name := by
        rw [previous]
        simp
      simpa [Previous] using filtered
    refine ⟨Or.inl (List.mem_map.mpr ⟨⟨name, before⟩, fileMember, rfl⟩), ?_⟩
    simp [PlanChange, Change.name, previous, desired]
  | keep name digest =>
    rcases expected with ⟨previous, desired⟩
    have fileMember : (⟨name, digest⟩ : FileIdentity) ∈ input.previous := by
      have filtered : (⟨name, digest⟩ : FileIdentity) ∈ Previous input name := by
        rw [previous]
        simp
      simpa [Previous] using filtered
    refine ⟨Or.inl (List.mem_map.mpr ⟨⟨name, digest⟩, fileMember, rfl⟩), ?_⟩
    simp [PlanChange, Change.name, previous, desired]

private theorem canonicalChanges_mem (input : Input) (change : Change) :
    change ∈ CanonicalChanges input ↔
      ∃ name ∈ RequiredNames input, PlanChange input name = some change := by
  simp [CanonicalChanges, List.mem_filterMap]

private theorem map_filterMap_plan_names (input : Input)
    (none : ∀ issue, ¬ RequiredIssue input issue) :
    ∀ (names : List RoleName), (∀ name, name ∈ names → RequiredName input name) →
      (names.filterMap (PlanChange input)).map Change.name = names := by
  intro names
  induction names with
  | nil => intro required; rfl
  | cons name tail ih =>
    intro required
    have headRequired := required name (by simp)
    have tailRequired : ∀ value, value ∈ tail → RequiredName input value := by
      intro value member
      exact required value (by simp [member])
    obtain ⟨change, planned, expected⟩ := planChange_exact_of_no_required input none name headRequired
    have nameEqual := planChange_name planned
    simp [planned, nameEqual, ih tailRequired]

private theorem canonicalChanges_names_eq_of_no_required (input : Input)
    (none : ∀ issue, ¬ RequiredIssue input issue) :
    (CanonicalChanges input).map Change.name = RequiredNames input := by
  apply map_filterMap_plan_names input none
  intro name member
  exact (requiredNames_mem input name).1 member

private theorem canonicalChanges_names_nodup_of_no_required (input : Input)
    (none : ∀ issue, ¬ RequiredIssue input issue) :
    (CanonicalChanges input).map Change.name |>.Nodup := by
  rw [canonicalChanges_names_eq_of_no_required input none]
  exact requiredNames_nodup input

private theorem canonicalChanges_names_exact_of_no_required (input : Input)
    (none : ∀ issue, ¬ RequiredIssue input issue) (name : RoleName) :
    name ∈ (CanonicalChanges input).map Change.name ↔ RequiredName input name := by
  rw [canonicalChanges_names_eq_of_no_required input none]
  exact requiredNames_mem input name

private theorem canonicalChanges_values_sorted_of_no_required (input : Input)
    (none : ∀ issue, ¬ RequiredIssue input issue) :
    ((CanonicalChanges input).map (fun change => change.name.value)).Pairwise Utf8Before := by
  have namesEqual := canonicalChanges_names_eq_of_no_required input none
  have sorted := List.pairwise_map.mpr (requiredNames_sorted input)
  rw [← namesEqual] at sorted
  simpa [List.map_map, Function.comp_def] using sorted

private theorem review_ready_no_required {input : Input} {changes : List Change}
    (accepted : reviewInput input = .ready changes) :
    ∀ issue, ¬ RequiredIssue input issue :=
  no_required_of_empty_issues input (review_ready_facts accepted).1

private theorem perm_list_nil_exact {α : Type} {values : List α}
    (permutation : values.Perm []) : values = [] := by
  cases values with
  | nil => rfl
  | cons head tail => have lengthEqual := permutation.length_eq; simp at lengthEqual

private theorem perm_list_singleton_exact {α : Type} {values : List α} {value : α}
    (permutation : values.Perm [value]) : values = [value] := by
  cases values with
  | nil => have lengthEqual := permutation.length_eq; simp at lengthEqual
  | cons head tail =>
    cases tail with
    | nil =>
      have headMember : head ∈ [value] := permutation.mem_iff.mp (by simp)
      have headEqual : head = value := List.mem_singleton.mp headMember
      simp [headEqual]
    | cons next rest => have lengthEqual := permutation.length_eq; simp at lengthEqual

private def unsafeReasonLists (previous : List FileIdentity) (observed : List ObservedFile) :
    Option Reason :=
  match previous, observed with
  | [], [⟨_, .absent⟩] => none
  | [], [⟨_, .file _⟩] => some .unowned
  | [_], [⟨_, .absent⟩] => some .drift
  | [before], [⟨_, .file digest⟩] =>
    if before.digest = digest then none else some .drift
  | _, [⟨_, .conflict⟩] => some .unowned
  | _, [⟨_, .unknown⟩] => some .unknown
  | _, _ => none

private theorem unsafeReason_eq_lists (input : Input) (name : RoleName) :
    UnsafeReason input name = unsafeReasonLists (Previous input name) (Observed input name) := rfl

private theorem unsafeReasonLists_perm
    {previousLeft previousRight : List FileIdentity}
    {observedLeft observedRight : List ObservedFile}
    (previousPerm : previousLeft.Perm previousRight)
    (observedPerm : observedLeft.Perm observedRight) :
    unsafeReasonLists previousLeft observedLeft =
      unsafeReasonLists previousRight observedRight := by
  cases previousLeft with
  | nil =>
    have previousRightNil : previousRight = [] := perm_list_nil_exact previousPerm.symm
    subst previousRight
    cases observedLeft with
    | nil =>
      have observedRightNil : observedRight = [] := perm_list_nil_exact observedPerm.symm
      subst observedRight
      rfl
    | cons observedHead observedTail =>
      cases observedTail with
      | nil =>
        have observedRightEqual : observedRight = [observedHead] :=
          perm_list_singleton_exact observedPerm.symm
        rw [observedRightEqual]
      | cons observedNext observedRest =>
        cases observedRight with
        | nil => have lengthEqual := observedPerm.length_eq; simp at lengthEqual
        | cons rightHead rightTail =>
          cases rightTail with
          | nil => have lengthEqual := observedPerm.length_eq; simp at lengthEqual
          | cons rightNext rightRest => simp [unsafeReasonLists]
  | cons previousHead previousTail =>
    cases previousTail with
    | nil =>
      have previousRightEqual : previousRight = [previousHead] :=
        perm_list_singleton_exact previousPerm.symm
      subst previousRight
      cases observedLeft with
      | nil =>
        have observedRightNil : observedRight = [] := perm_list_nil_exact observedPerm.symm
        subst observedRight
        rfl
      | cons observedHead observedTail =>
        cases observedTail with
        | nil =>
          have observedRightEqual : observedRight = [observedHead] :=
            perm_list_singleton_exact observedPerm.symm
          rw [observedRightEqual]
        | cons observedNext observedRest =>
          cases observedRight with
          | nil => have lengthEqual := observedPerm.length_eq; simp at lengthEqual
          | cons rightHead rightTail =>
            cases rightTail with
            | nil => have lengthEqual := observedPerm.length_eq; simp at lengthEqual
            | cons rightNext rightRest => simp [unsafeReasonLists]
    | cons previousNext previousRest =>
      cases previousRight with
      | nil => have lengthEqual := previousPerm.length_eq; simp at lengthEqual
      | cons rightHead rightTail =>
        cases rightTail with
        | nil => have lengthEqual := previousPerm.length_eq; simp at lengthEqual
        | cons rightNext rightRest =>
          cases observedLeft with
          | nil =>
            have observedRightNil : observedRight = [] := perm_list_nil_exact observedPerm.symm
            subst observedRight
            rfl
          | cons observedHead observedTail =>
            cases observedTail with
            | nil =>
              have observedRightEqual : observedRight = [observedHead] :=
                perm_list_singleton_exact observedPerm.symm
              rw [observedRightEqual]
              cases observedHead with
              | mk role observation => cases observation <;> simp [unsafeReasonLists]
            | cons observedNext observedRest =>
              cases observedRight with
              | nil => have lengthEqual := observedPerm.length_eq; simp at lengthEqual
              | cons rightObservedHead rightObservedTail =>
                cases rightObservedTail with
                | nil => have lengthEqual := observedPerm.length_eq; simp at lengthEqual
                | cons rightObservedNext rightObservedRest => simp [unsafeReasonLists]

private theorem requiredName_perm (left right : Input) {name : RoleName}
    (previousPerm : left.previous.Perm right.previous)
    (desiredPerm : left.desired.Perm right.desired) :
    RequiredName left name ↔ RequiredName right name := by
  unfold RequiredName
  constructor
  · rintro (previousMember | desiredMember)
    · exact Or.inl ((previousPerm.map FileIdentity.name).mem_iff.mp previousMember)
    · exact Or.inr ((desiredPerm.map FileIdentity.name).mem_iff.mp desiredMember)
  · rintro (previousMember | desiredMember)
    · exact Or.inl ((previousPerm.map FileIdentity.name).mem_iff.mpr previousMember)
    · exact Or.inr ((desiredPerm.map FileIdentity.name).mem_iff.mpr desiredMember)

private theorem requiredIssue_from_parts (left right : Input) (name : RoleName) (reason : Reason)
    (requiredEqual : RequiredName left name ↔ RequiredName right name)
    (previousEqual : Previous left name = Previous right name)
    (desiredEqual : Desired left name = Desired right name)
    (observedEqual : Observed left name = Observed right name) :
    RequiredIssue left ⟨name, reason⟩ ↔ RequiredIssue right ⟨name, reason⟩ := by
  cases reason <;>
    simp [RequiredIssue, requiredEqual, previousEqual, desiredEqual, observedEqual,
      UnsafeReason]

private theorem requiredIssue_observation_invariant (left right : Input) (name : RoleName)
    (reason : Reason) (previousEqual : left.previous = right.previous)
    (desiredEqual : left.desired = right.desired)
    (observedEqual : ∀ name, RequiredName left name → Observed left name = Observed right name) :
    RequiredIssue left ⟨name, reason⟩ ↔ RequiredIssue right ⟨name, reason⟩ := by
  have requiredEqual : RequiredName left name ↔ RequiredName right name := by
    simp [RequiredName, previousEqual, desiredEqual]
  have previousFilteredEqual : Previous left name = Previous right name := by
    simp [Previous, previousEqual]
  have desiredFilteredEqual : Desired left name = Desired right name := by
    simp [Desired, desiredEqual]
  by_cases requiredLeft : RequiredName left name
  · have observationsEqual := observedEqual name requiredLeft
    exact requiredIssue_from_parts left right name reason requiredEqual
      previousFilteredEqual desiredFilteredEqual observationsEqual
  · have requiredRight : ¬ RequiredName right name := by
      intro present
      exact requiredLeft (requiredEqual.mpr present)
    cases reason <;> simp [RequiredIssue, requiredLeft, requiredRight]

private theorem requiredIssue_perm (left right : Input) (name : RoleName) (reason : Reason)
    (previousPerm : left.previous.Perm right.previous)
    (desiredPerm : left.desired.Perm right.desired)
    (observedPerm : left.observed.Perm right.observed) :
    RequiredIssue left ⟨name, reason⟩ ↔ RequiredIssue right ⟨name, reason⟩ := by
  have requiredEqual := requiredName_perm left right (name := name) previousPerm desiredPerm
  have previousFilteredPerm := previousPerm.filter (fun file => file.name == name)
  have desiredFilteredPerm := desiredPerm.filter (fun file => file.name == name)
  have observedFilteredPerm := observedPerm.filter (fun file => file.name == name)
  have previousEqual :
      (Previous left name).length = (Previous right name).length := by
    exact previousFilteredPerm.length_eq
  have desiredEqual :
      (Desired left name).length = (Desired right name).length := by
    exact desiredFilteredPerm.length_eq
  have observedEqual :
      (Observed left name).length = (Observed right name).length := by
    exact observedFilteredPerm.length_eq
  have unsafeEqual : UnsafeReason left name = UnsafeReason right name := by
    rw [unsafeReason_eq_lists left name, unsafeReason_eq_lists right name]
    exact unsafeReasonLists_perm previousFilteredPerm observedFilteredPerm
  cases reason <;> simp [RequiredIssue, requiredEqual, previousEqual, desiredEqual,
    observedEqual, unsafeEqual]

private theorem requiredNames_perm (left right : Input)
    (previousPerm : left.previous.Perm right.previous)
    (desiredPerm : left.desired.Perm right.desired) :
    RequiredNames left = RequiredNames right := by
  have previousNamesPerm := previousPerm.map FileIdentity.name
  have desiredNamesPerm := desiredPerm.map FileIdentity.name
  have namesPerm := previousNamesPerm.append desiredNamesPerm
  unfold RequiredNames
  apply Compiler.ordered_unique_eq NameKey _ _
  · intro value
    exact namesPerm.mem_iff
  · intro leftName rightName equal
    exact nameKey_injective equal

private theorem canonicalIssues_perm (left right : Input)
    (previousPerm : left.previous.Perm right.previous)
    (desiredPerm : left.desired.Perm right.desired)
    (observedPerm : left.observed.Perm right.observed) :
    CanonicalIssues left = CanonicalIssues right := by
  unfold CanonicalIssues
  apply Compiler.ordered_unique_eq IssueKey (IssueCandidates left) (IssueCandidates right)
  · intro issue
    rw [mem_issueCandidates, mem_issueCandidates]
    cases issue with
    | mk name reason =>
      exact requiredIssue_perm left right name reason previousPerm desiredPerm observedPerm
  · intro leftIssue rightIssue equal
    exact issueKey_injective equal

private theorem perm_eq_of_length_le_one {α : Type} {left right : List α}
    (permutation : left.Perm right) (bound : left.length ≤ 1) : left = right := by
  cases left with
  | nil =>
    have rightNil := perm_list_nil_exact permutation.symm
    exact rightNil.symm
  | cons head tail =>
    cases tail with
    | nil => exact (perm_list_singleton_exact permutation.symm).symm
    | cons next rest => simp at bound

private theorem planChange_eq_of_no_required_perm (left right : Input) (name : RoleName)
    (none : ∀ issue, ¬ RequiredIssue left issue)
    (previousPerm : left.previous.Perm right.previous)
    (desiredPerm : left.desired.Perm right.desired) :
    PlanChange left name = PlanChange right name := by
  have previousFilteredPerm := previousPerm.filter (fun file => file.name == name)
  have desiredFilteredPerm := desiredPerm.filter (fun file => file.name == name)
  have previousBound := previous_length_le_one_of_no_required left none name
  have desiredBound := desired_length_le_one_of_no_required left none name
  have previousEqual : Previous left name = Previous right name :=
    perm_eq_of_length_le_one previousFilteredPerm previousBound
  have desiredEqual : Desired left name = Desired right name :=
    perm_eq_of_length_le_one desiredFilteredPerm desiredBound
  simp only [PlanChange]
  rw [previousEqual, desiredEqual]

private theorem filterMap_planChange_eq (left right : Input) (names : List RoleName)
    (pointwise : ∀ name, name ∈ names → PlanChange left name = PlanChange right name) :
    (names.filterMap (PlanChange left)) = (names.filterMap (PlanChange right)) := by
  induction names with
  | nil => rfl
  | cons name tail ih =>
    have headEqual := pointwise name (by simp)
    have tailPointwise : ∀ value, value ∈ tail →
        PlanChange left value = PlanChange right value := by
      intro value member
      exact pointwise value (by simp [member])
    simp only [List.filterMap_cons]
    rw [headEqual, ih tailPointwise]

private theorem canonicalChanges_eq_of_pointwise (left right : Input)
    (namesEqual : RequiredNames left = RequiredNames right)
    (pointwise : ∀ name, name ∈ RequiredNames left →
      PlanChange left name = PlanChange right name) :
    CanonicalChanges left = CanonicalChanges right := by
  unfold CanonicalChanges
  rw [← namesEqual]
  exact filterMap_planChange_eq left right (RequiredNames left) pointwise

namespace Proofs

theorem F1_accepted_before_safe : F1_accepted_before_safe model := by
  intro input changes accepted
  exact safe_of_no_required input (review_ready_no_required accepted)

theorem F2_safe_input_succeeds : F2_safe_input_succeeds model := by
  intro input safe
  have none := no_required_of_safe input safe
  have empty := empty_issues_of_no_required input none
  exact ⟨CanonicalChanges input, by simp [model, reviewInput, empty]⟩

theorem F3_issues_exact : F3_issues_exact model := by
  constructor
  · intro input issue
    constructor
    · intro required
      cases normalized : reviewInput input with
      | ready changes => exact False.elim ((review_ready_no_required normalized) issue required)
      | blocked issues => exact ⟨issues, normalized, by
          rw [review_blocked_list normalized]
          exact (mem_canonicalIssues input issue).2 required⟩
    · rintro ⟨issues, normalized, member⟩
      rw [review_blocked_list normalized] at member
      exact (mem_canonicalIssues input issue).1 member
  · intro input issues blocked
    rw [review_blocked_list blocked]
    exact List.pairwise_map.mpr (canonicalIssues_sorted input)

theorem F4_required_names_exact : F4_required_names_exact model := by
  intro input changes accepted
  have none := review_ready_no_required accepted
  rw [(review_ready_facts accepted).2]
  refine ⟨canonicalChanges_names_nodup_of_no_required input none,
    ?_, canonicalChanges_values_sorted_of_no_required input none⟩
  intro name
  exact canonicalChanges_names_exact_of_no_required input none name

theorem F5_changes_preserve_identities : F5_changes_preserve_identities model := by
  intro input changes accepted change
  have none := review_ready_no_required accepted
  rw [(review_ready_facts accepted).2]
  constructor
  · intro member
    obtain ⟨name, requiredName, planned⟩ := (canonicalChanges_mem input change).1 member
    obtain ⟨plannedChange, exactPlan, expected⟩ := planChange_exact_of_no_required input none name
      ((requiredNames_mem input name).1 requiredName)
    have same : plannedChange = change := by
      exact Option.some.inj (exactPlan.symm.trans planned)
    simpa [same] using expected
  · intro expected
    obtain ⟨requiredName, planned⟩ := expected_change_required_and_plan input change expected
    exact (canonicalChanges_mem input change).2 ⟨change.name,
      (requiredNames_mem input change.name).2 requiredName, planned⟩

theorem F6_unrelated_observations_irrelevant : F6_unrelated_observations_irrelevant model := by
  intro left right previousEqual desiredEqual observedEqual
  have issueMembership : ∀ issue, RequiredIssue left issue ↔ RequiredIssue right issue := by
    intro issue
    cases issue with
    | mk name reason =>
      exact requiredIssue_observation_invariant left right name reason
        previousEqual desiredEqual observedEqual
  have issuesEqual : CanonicalIssues left = CanonicalIssues right := by
    unfold CanonicalIssues
    apply Compiler.ordered_unique_eq IssueKey (IssueCandidates left) (IssueCandidates right)
    · intro issue
      rw [mem_issueCandidates, mem_issueCandidates]
      exact issueMembership issue
    · intro leftIssue rightIssue equal
      exact issueKey_injective equal
  have namesEqual : RequiredNames left = RequiredNames right := by
    unfold RequiredNames
    rw [previousEqual, desiredEqual]
  have planEqual : ∀ name, PlanChange left name = PlanChange right name := by
    intro name
    simp [PlanChange, Previous, Desired, previousEqual, desiredEqual]
  have changesEqual := canonicalChanges_eq_of_pointwise left right namesEqual (by
    intro name _
    exact planEqual name)
  simp [model, reviewInput, issuesEqual, changesEqual]

theorem F7_enumeration_invariant : F7_enumeration_invariant model := by
  intro left right previousPerm desiredPerm observedPerm
  have issuesEqual := canonicalIssues_perm left right previousPerm desiredPerm observedPerm
  have namesEqual := requiredNames_perm left right previousPerm desiredPerm
  by_cases empty : CanonicalIssues left = []
  · have none := no_required_of_empty_issues left empty
    have changesEqual := canonicalChanges_eq_of_pointwise left right namesEqual (by
      intro name member
      exact planChange_eq_of_no_required_perm left right name none previousPerm desiredPerm)
    have rightEmpty : CanonicalIssues right = [] := by rw [← issuesEqual]; exact empty
    simp [model, reviewInput, empty, rightEmpty, changesEqual]
  · have rightNonempty : CanonicalIssues right ≠ [] := by
      intro rightEmpty
      apply empty
      rw [issuesEqual, rightEmpty]
    simp [model, reviewInput, rightNonempty, issuesEqual]

theorem F8_unchanged_set_keeps_only : F8_unchanged_set_keeps_only model := by
  intro input changes same accepted change member
  have expected := (F5_changes_preserve_identities input changes accepted change).1 member
  have transitionsEqual (name : RoleName) : Previous input name = Desired input name := by
    unfold Previous Desired
    rw [same]
  cases change with
  | create name after =>
      rcases expected with ⟨previous, desired⟩
      rw [transitionsEqual name] at previous
      rw [desired] at previous
      simp at previous
  | replace name before after =>
      rcases expected with ⟨different, previous, desired⟩
      have identities : ([⟨name, before⟩] : List FileIdentity) = [⟨name, after⟩] :=
        previous.symm.trans ((transitionsEqual name).trans desired)
      have identityEqual := List.cons.inj identities
      have digestEqual := congrArg FileIdentity.digest identityEqual.1
      exact False.elim (different digestEqual)
  | remove name before =>
      rcases expected with ⟨previous, desired⟩
      rw [← transitionsEqual name] at desired
      rw [previous] at desired
      simp at desired
  | keep name digest => exact ⟨name, digest, rfl⟩

end Proofs

end PluginSdk.Installer.Companions
