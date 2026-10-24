import PluginSdk.TreeRead.Model

namespace PluginSdk.TreeRead.Proofs

private theorem entry_acceptance_exact (input : EntryInput) :
    admitEntry input = .accepted ↔ EntryReady input := by
  constructor
  · intro accepted
    have available : EntryAvailable input := by
      by_cases available : EntryAvailable input
      · exact available
      · simp [admitEntry, available] at accepted
    have regular : EntryRegular input := by
      by_cases regular : EntryRegular input
      · exact regular
      · simp [admitEntry, available, regular] at accepted
    have noUnsupported : ¬ Unsupported input.paths := by
      intro unsupported
      simp [admitEntry, available, regular, unsupported] at accepted
    have noStream : ¬ Stream input.paths := by
      intro stream
      simp [admitEntry, available, regular, noUnsupported, stream] at accepted
    have bound : EntryBound input := by
      by_cases bound : EntryBound input
      · exact bound
      · simp [admitEntry, available, regular, noUnsupported, noStream, bound] at accepted
    have contained : EntryContained input := by
      by_cases contained : EntryContained input
      · exact contained
      · simp [admitEntry, available, regular, noUnsupported, noStream, bound, contained] at accepted
    have exactEntry : ExactEntry input := by
      by_cases exactEntry : ExactEntry input
      · exact exactEntry
      · simp [admitEntry, available, regular, noUnsupported, noStream, bound, contained,
          exactEntry] at accepted
    have linkAllowed : LinkAllowed input := by
      by_cases linkAllowed : LinkAllowed input
      · exact linkAllowed
      · simp [admitEntry, available, regular, noUnsupported, noStream, bound, contained,
          exactEntry, linkAllowed] at accepted
    have cycleFree : CycleFree input := by
      by_cases cycleFree : CycleFree input
      · exact cycleFree
      · simp [admitEntry, available, regular, noUnsupported, noStream, bound, contained,
          exactEntry, linkAllowed, cycleFree] at accepted
    exact ⟨available, regular, noUnsupported, noStream, bound, contained, exactEntry,
      linkAllowed, cycleFree⟩
  · rintro ⟨available, regular, noUnsupported, noStream, bound, contained, exactEntry,
      linkAllowed, cycleFree⟩
    simp [admitEntry, available, regular, noUnsupported, noStream, bound, contained,
      exactEntry, linkAllowed, cycleFree]

private theorem directory_acceptance_exact (input : DirectoryInput) :
    admitDirectory input = .accepted ↔ DirectoryReady input := by
  constructor
  · intro accepted
    have available : DirectoryAvailable input := by
      by_cases available : DirectoryAvailable input
      · exact available
      · simp [admitDirectory, available] at accepted
    have regular : DirectoryRegular input := by
      by_cases regular : DirectoryRegular input
      · exact regular
      · simp [admitDirectory, available, regular] at accepted
    have noUnsupported : ¬ Unsupported input.paths := by
      intro unsupported
      simp [admitDirectory, available, regular, unsupported] at accepted
    have noStream : ¬ Stream input.paths := by
      intro stream
      simp [admitDirectory, available, regular, noUnsupported, stream] at accepted
    have bound : DirectoryBound input := by
      by_cases bound : DirectoryBound input
      · exact bound
      · simp [admitDirectory, available, regular, noUnsupported, noStream, bound] at accepted
    have contained : AtOrInside input.root input.directory := by
      by_cases contained : AtOrInside input.root input.directory
      · exact contained
      · simp [admitDirectory, available, regular, noUnsupported, noStream, bound, contained] at accepted
    have unique : UniqueNames input := by
      by_cases unique : UniqueNames input
      · exact unique
      · simp [admitDirectory, available, regular, noUnsupported, noStream, bound, contained,
          unique] at accepted
    have enumerationsAgree : EnumerationsAgree input := by
      by_cases enumerationsAgree : EnumerationsAgree input
      · exact enumerationsAgree
      · simp [admitDirectory, available, regular, noUnsupported, noStream, bound, contained,
          unique, enumerationsAgree] at accepted
    have visitsComplete : VisitsComplete input := by
      by_cases visitsComplete : VisitsComplete input
      · exact visitsComplete
      · simp [admitDirectory, available, regular, noUnsupported, noStream, bound, contained,
          unique, enumerationsAgree, visitsComplete] at accepted
    exact ⟨available, regular, noUnsupported, noStream, bound, contained, unique,
      enumerationsAgree, visitsComplete⟩
  · rintro ⟨available, regular, noUnsupported, noStream, bound, contained, unique,
      enumerationsAgree, visitsComplete⟩
    simp [admitDirectory, available, regular, noUnsupported, noStream, bound, contained,
      unique, enumerationsAgree, visitsComplete]

private theorem nodup_triple_perm {α : Type} {left₁ left₂ middle₁ middle₂ right₁ right₂ : List α}
    (leftPerm : left₁.Perm left₂) (middlePerm : middle₁.Perm middle₂)
    (rightPerm : right₁.Perm right₂) :
    (left₁.Nodup ∧ middle₁.Nodup ∧ right₁.Nodup) ↔
      (left₂.Nodup ∧ middle₂.Nodup ∧ right₂.Nodup) := by
  constructor
  · rintro ⟨leftNodup, middleNodup, rightNodup⟩
    exact ⟨leftPerm.nodup_iff.mp leftNodup, middlePerm.nodup_iff.mp middleNodup,
      rightPerm.nodup_iff.mp rightNodup⟩
  · rintro ⟨leftNodup, middleNodup, rightNodup⟩
    exact ⟨leftPerm.nodup_iff.mpr leftNodup, middlePerm.nodup_iff.mpr middleNodup,
      rightPerm.nodup_iff.mpr rightNodup⟩

theorem TR1_entry_acceptance_exact :
    _root_.PluginSdk.TreeRead.TR1_entry_acceptance_exact model := by
  intro input
  change admitEntry input = .accepted ↔ EntryReady input
  exact entry_acceptance_exact input

theorem TR2_entry_unavailable_refuses :
    _root_.PluginSdk.TreeRead.TR2_entry_unavailable_refuses model := by
  intro input unavailable accepted
  exact unavailable ((TR1_entry_acceptance_exact input).mp accepted).1

theorem TR3_disallowed_reparse_refuses :
    _root_.PluginSdk.TreeRead.TR3_disallowed_reparse_refuses model := by
  intro input info entryEq disallowed accepted
  rcases (TR1_entry_acceptance_exact input).mp accepted with
    ⟨_, _, _, _, _, _, _, linkAllowed, _⟩
  rw [LinkAllowed, entryEq] at linkAllowed
  rcases linkAllowed with ⟨source, tag⟩
  rcases disallowed with payload | unknown
  · cases source.symm.trans payload
  · rcases tag with mountPoint | symbolicLink
    · exact unknown.1 mountPoint
    · exact unknown.2 symbolicLink

theorem TR4_component_alias_refuses :
    _root_.PluginSdk.TreeRead.TR4_component_alias_refuses model := by
  intro input notExact accepted
  rcases (TR1_entry_acceptance_exact input).mp accepted with
    ⟨_, _, _, _, _, _, exactEntry, _, _⟩
  exact notExact exactEntry

theorem TR5_entry_escape_refuses :
    _root_.PluginSdk.TreeRead.TR5_entry_escape_refuses model := by
  intro input outside accepted
  rcases (TR1_entry_acceptance_exact input).mp accepted with
    ⟨_, _, _, _, _, contained, _, _, _⟩
  exact outside contained

theorem TR6_ancestor_cycle_refuses :
    _root_.PluginSdk.TreeRead.TR6_ancestor_cycle_refuses model := by
  intro input cyclic accepted
  rcases (TR1_entry_acceptance_exact input).mp accepted with
    ⟨_, _, _, _, _, _, _, _, cycleFree⟩
  rcases cyclic with repeatedBranch | repeatedTarget
  · exact repeatedBranch cycleFree.1
  · rcases repeatedTarget with ⟨anchor, targetEq, member⟩
    have absent : anchor.identity ∉ input.branch.anchors.map (·.identity) := by
      simpa [CycleFree, targetEq] using cycleFree.2
    exact absent member

theorem TR7_entry_rebinding_refuses :
    _root_.PluginSdk.TreeRead.TR7_entry_rebinding_refuses model := by
  intro input changed accepted
  rcases (TR1_entry_acceptance_exact input).mp accepted with
    ⟨_, _, _, _, bound, _, _, _, _⟩
  exact changed bound

theorem TR8_directory_acceptance_exact :
    _root_.PluginSdk.TreeRead.TR8_directory_acceptance_exact model := by
  intro input
  change admitDirectory input = .accepted ↔ DirectoryReady input
  exact directory_acceptance_exact input

theorem TR9_failed_enumeration_refuses :
    _root_.PluginSdk.TreeRead.TR9_failed_enumeration_refuses model := by
  intro input failed accepted
  rcases (TR8_directory_acceptance_exact input).mp accepted with
    ⟨available, _, _, _, _, _, _, _, _⟩
  rcases available with ⟨_, _, _, beforeComplete, afterComplete⟩
  rcases failed with beforeFailed | afterFailed
  · exact beforeComplete beforeFailed
  · exact afterComplete afterFailed

theorem TR10_duplicate_member_refuses :
    _root_.PluginSdk.TreeRead.TR10_duplicate_member_refuses model := by
  intro input duplicate accepted
  rcases (TR8_directory_acceptance_exact input).mp accepted with
    ⟨_, _, _, _, _, _, unique, _, _⟩
  exact duplicate unique

theorem TR11_every_member_visited_once :
    _root_.PluginSdk.TreeRead.TR11_every_member_visited_once model := by
  intro input beforeNames afterNames beforeEq afterEq accepted
  rcases (TR8_directory_acceptance_exact input).mp accepted with
    ⟨_, _, _, _, _, _, unique, agree, visits⟩
  have namesUnique : beforeNames.Nodup ∧ afterNames.Nodup ∧ input.visited.Nodup := by
    simpa [UniqueNames, Enumeration.names, beforeEq, afterEq] using unique
  have namesAgree : beforeNames.Perm afterNames := by
    simpa [EnumerationsAgree, Enumeration.names, beforeEq, afterEq] using agree
  have namesVisited : beforeNames.Perm input.visited := by
    simpa [VisitsComplete, Enumeration.names, beforeEq] using visits
  exact ⟨namesAgree, namesVisited, namesUnique.1, namesUnique.2.1, namesUnique.2.2⟩

theorem TR12_changed_directory_refuses :
    _root_.PluginSdk.TreeRead.TR12_changed_directory_refuses model := by
  intro input changed accepted
  rcases (TR8_directory_acceptance_exact input).mp accepted with
    ⟨_, _, _, _, bound, _, _, _, _⟩
  exact changed bound

theorem TR13_enumeration_order_independent :
    _root_.PluginSdk.TreeRead.TR13_enumeration_order_independent model := by
  intro input beforeNames afterNames beforeOther afterOther visitedOther beforeEq afterEq
    beforePerm afterPerm visitedPerm
  let other : DirectoryInput := { input with
    enumeratedBefore := .complete beforeOther
    enumeratedAfter := .complete afterOther
    visited := visitedOther }
  have available : DirectoryAvailable other ↔ DirectoryAvailable input := by
    simp [DirectoryAvailable, other, beforeEq, afterEq]
  have regular : DirectoryRegular other ↔ DirectoryRegular input := Iff.rfl
  have unsupported : Unsupported other.paths ↔ Unsupported input.paths := Iff.rfl
  have stream : Stream other.paths ↔ Stream input.paths := Iff.rfl
  have bound : DirectoryBound other ↔ DirectoryBound input := Iff.rfl
  have contained : AtOrInside other.root other.directory ↔ AtOrInside input.root input.directory := Iff.rfl
  have unique : UniqueNames other ↔ UniqueNames input := by
    change (beforeOther.Nodup ∧ afterOther.Nodup ∧ visitedOther.Nodup) ↔
      (input.enumeratedBefore.names.Nodup ∧ input.enumeratedAfter.names.Nodup ∧ input.visited.Nodup)
    rw [beforeEq, afterEq]
    exact nodup_triple_perm beforePerm.symm afterPerm.symm visitedPerm.symm
  have enumerationsAgree : EnumerationsAgree other ↔ EnumerationsAgree input := by
    change beforeOther.Perm afterOther ↔
      input.enumeratedBefore.names.Perm input.enumeratedAfter.names
    rw [beforeEq, afterEq]
    constructor
    · intro reorderedAgree
      exact beforePerm.trans (reorderedAgree.trans afterPerm.symm)
    · intro originalAgree
      exact beforePerm.symm.trans (originalAgree.trans afterPerm)
  have visitsComplete : VisitsComplete other ↔ VisitsComplete input := by
    change beforeOther.Perm visitedOther ↔ input.enumeratedBefore.names.Perm input.visited
    rw [beforeEq]
    constructor
    · intro reorderedComplete
      exact beforePerm.trans (reorderedComplete.trans visitedPerm.symm)
    · intro originalComplete
      exact beforePerm.symm.trans (originalComplete.trans visitedPerm)
  change admitDirectory other = admitDirectory input
  simp [admitDirectory, available, regular, unsupported, stream, bound, contained,
    unique, enumerationsAgree, visitsComplete]

end PluginSdk.TreeRead.Proofs
