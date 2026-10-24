import PluginSdk.Compiler.Hooks.Types

namespace PluginSdk.Compiler.Hooks

theorem indexedHooks_length (input : Input) :
    (indexedHooks input).length = input.hooks.length := by
  have enumerateLength {α : Type} (start : Nat) (values : List α) :
      (Generated.enumerateFrom start values).length = values.length := by
    induction values generalizing start with
    | nil => rfl
    | cons head tail inductionHypothesis => simp [Generated.enumerateFrom, inductionHypothesis]
  have canonicalLength : (canonicalHooks input.hooks).length = input.hooks.length :=
    (ordered_perm (fun entry : String × Hook => [entry.1]) input.hooks).length_eq
  simp [indexedHooks, enumerateLength, canonicalLength]

theorem indexedHooks_ordinal_pairwise (input : Input) :
    (indexedHooks input).Pairwise (fun left right => left.ordinal < right.ordinal) := by
  unfold indexedHooks
  apply List.Pairwise.map
    (fun item : Nat × (String × Hook) => IndexedHook.mk item.1 item.2.1 item.2.2)
    (fun left right ordered => ordered)
  exact Generated.enumerateFrom_pairwise 0 (canonicalHooks input.hooks)

end PluginSdk.Compiler.Hooks
