import PluginSdk.Distribution.Selection.Types

namespace PluginSdk.Distribution.Selection

def S1_selected_is_sole_candidate (model : Interface) : Prop :=
  ∀ input format, model.select input = .selected format → CompatibleFormats input = [format]

def S2_sole_candidate_selected (model : Interface) : Prop :=
  ∀ input format, CompatibleFormats input = [format] → model.select input = .selected format

def S3_blocking_exact (model : Interface) : Prop :=
  (∀ input, model.select input = .unavailable ↔ CompatibleFormats input = []) ∧
  (∀ input, model.select input = .ambiguous ↔ 1 < (CompatibleFormats input).length)

def S4_enumeration_invariant (model : Interface) : Prop :=
  ∀ left right, left.host = right.host → left.formats.Perm right.formats →
    model.select left = model.select right

def S5_cursor_family_conservation (model : Interface) : Prop :=
  ∀ formats, model.select ⟨.cursor, formats⟩ = model.select ⟨.claudeCode, formats⟩

end PluginSdk.Distribution.Selection
