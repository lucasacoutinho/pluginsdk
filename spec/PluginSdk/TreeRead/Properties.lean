import PluginSdk.TreeRead.Rules

namespace PluginSdk.TreeRead

def TR1_entry_acceptance_exact (model : Interface) : Prop :=
  ∀ input, model.entry input = .accepted ↔ EntryReady input

def TR2_entry_unavailable_refuses (model : Interface) : Prop :=
  ∀ input, ¬ EntryAvailable input → model.entry input ≠ .accepted

def TR3_disallowed_reparse_refuses (model : Interface) : Prop :=
  ∀ input info, input.entry = .reparse info →
    (input.policy = .payload ∨ (info.tag ≠ 2684354563 ∧ info.tag ≠ 2684354572)) →
      model.entry input ≠ .accepted

def TR4_component_alias_refuses (model : Interface) : Prop :=
  ∀ input, ¬ ExactEntry input → model.entry input ≠ .accepted

def TR5_entry_escape_refuses (model : Interface) : Prop :=
  ∀ input, ¬ EntryContained input → model.entry input ≠ .accepted

def TR6_ancestor_cycle_refuses (model : Interface) : Prop :=
  ∀ input,
    (¬ (input.branch.anchors.map (·.identity)).Nodup ∨
      ∃ anchor, input.target = .directory anchor ∧
        anchor.identity ∈ input.branch.anchors.map (·.identity)) →
      model.entry input ≠ .accepted

def TR7_entry_rebinding_refuses (model : Interface) : Prop :=
  ∀ input, ¬ EntryBound input → model.entry input ≠ .accepted

def TR8_directory_acceptance_exact (model : Interface) : Prop :=
  ∀ input, model.directory input = .accepted ↔ DirectoryReady input

def TR9_failed_enumeration_refuses (model : Interface) : Prop :=
  ∀ input, input.enumeratedBefore = .failed ∨ input.enumeratedAfter = .failed →
    model.directory input ≠ .accepted

def TR10_duplicate_member_refuses (model : Interface) : Prop :=
  ∀ input, ¬ UniqueNames input → model.directory input ≠ .accepted

def TR11_every_member_visited_once (model : Interface) : Prop :=
  ∀ input beforeNames afterNames,
    input.enumeratedBefore = .complete beforeNames → input.enumeratedAfter = .complete afterNames →
    model.directory input = .accepted →
      beforeNames.Perm afterNames ∧ beforeNames.Perm input.visited ∧
      beforeNames.Nodup ∧ afterNames.Nodup ∧ input.visited.Nodup

def TR12_changed_directory_refuses (model : Interface) : Prop :=
  ∀ input, ¬ DirectoryBound input → model.directory input ≠ .accepted

def TR13_enumeration_order_independent (model : Interface) : Prop :=
  ∀ input beforeNames afterNames beforeOther afterOther visitedOther,
    input.enumeratedBefore = .complete beforeNames → input.enumeratedAfter = .complete afterNames →
    beforeNames.Perm beforeOther → afterNames.Perm afterOther → input.visited.Perm visitedOther →
    model.directory { input with
      enumeratedBefore := .complete beforeOther
      enumeratedAfter := .complete afterOther
      visited := visitedOther } = model.directory input

end PluginSdk.TreeRead
