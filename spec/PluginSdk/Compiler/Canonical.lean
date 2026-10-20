import Init.Data.List.Sort.Lemmas
import Init.Data.String.Basic
import PluginSdk.Compiler.Types

namespace PluginSdk.Compiler

instance : DecidableRel Utf8Before := fun _ _ => inferInstanceAs (Decidable (List.Lex _ _ _))

theorem utf8_irrefl (value : String) : ¬ Utf8Before value value :=
  List.lex_irrefl (fun (byte : UInt8) => Nat.lt_irrefl byte.toNat) _

theorem utf8_trans {a b c : String} (ab : Utf8Before a b) (bc : Utf8Before b c) : Utf8Before a c :=
  List.lex_trans Nat.lt_trans ab bc

theorem utf8_eq_of_not {a b : String} (ab : ¬ Utf8Before a b) (ba : ¬ Utf8Before b a) : a = b := by
  have bytes : a.toUTF8.data.toList = b.toUTF8.data.toList :=
    List.lex_trichotomous (fun x y xy yx => UInt8.toNat.inj (by omega)) ba ab
  apply String.toByteArray_inj.mp
  exact congrArg ByteArray.mk (Array.toList_inj.mp bytes)

abbrev Key := List String
abbrev KeyBefore : Key → Key → Prop := List.Lex Utf8Before

theorem key_irrefl (key : Key) : ¬ KeyBefore key key := List.lex_irrefl utf8_irrefl key

theorem key_trans {a b c : Key} (ab : KeyBefore a b) (bc : KeyBefore b c) : KeyBefore a c :=
  List.lex_trans utf8_trans ab bc

theorem key_eq_of_not {a b : Key} (ab : ¬ KeyBefore a b) (ba : ¬ KeyBefore b a) : a = b :=
  List.lex_trichotomous (fun _ _ => utf8_eq_of_not) ba ab

def ordered {α : Type} (key : α → Key) (values : List α) : List α :=
  values.mergeSort fun left right => decide (¬ KeyBefore (key right) (key left))

theorem ordered_perm {α : Type} (key : α → Key) (values : List α) :
    (ordered key values).Perm values := List.mergeSort_perm _ _

@[simp] theorem mem_ordered {α : Type} (key : α → Key) (values : List α) (value : α) :
    value ∈ ordered key values ↔ value ∈ values := (ordered_perm key values).mem_iff

theorem ordered_weak {α : Type} (key : α → Key) (values : List α) :
    (ordered key values).Pairwise (fun a b => ¬ KeyBefore (key b) (key a)) := by
  have trans : ∀ a b c : α,
      ¬ KeyBefore (key b) (key a) → ¬ KeyBefore (key c) (key b) → ¬ KeyBefore (key c) (key a) := by
    intro a b c ab bc ca
    by_cases ac : KeyBefore (key a) (key b)
    · exact bc (key_trans ca ac)
    · have equal := key_eq_of_not ac ab
      exact bc (equal ▸ ca)
  have total : ∀ a b : α,
      decide (¬ KeyBefore (key b) (key a)) || decide (¬ KeyBefore (key a) (key b)) := by
    intro a b
    simp only [Bool.or_eq_true, decide_eq_true_eq]
    by_cases ab : KeyBefore (key a) (key b)
    · exact Or.inl (fun ba => key_irrefl _ (key_trans ab ba))
    · exact Or.inr ab
  simpa only [ordered, decide_eq_true_eq] using
    List.pairwise_mergeSort (fun a b c ab bc => by
      simpa only [decide_eq_true_eq] using trans a b c (of_decide_eq_true ab) (of_decide_eq_true bc)) total values

theorem ordered_strict {α : Type} (key : α → Key) (values : List α)
    (distinct : values.Pairwise (fun a b => key a ≠ key b)) :
    (ordered key values).Pairwise (fun a b => KeyBefore (key a) (key b)) := by
  have unique := distinct.perm (ordered_perm key values).symm (fun h => Ne.symm h)
  exact (ordered_weak key values).imp₂ (fun a b ba ne => by
    by_cases ab : KeyBefore (key a) (key b)
    · exact ab
    · exact False.elim (ne (key_eq_of_not ab ba))) unique

theorem ordered_eq_of_perm {α : Type} (key : α → Key) {left right : List α}
    (permutation : left.Perm right)
    (unique : ∀ a ∈ left, ∀ b ∈ right, key a = key b → a = b) :
    ordered key left = ordered key right := by
  apply List.Perm.eq_of_pairwise (le := fun a b => ¬ KeyBefore (key b) (key a))
  · intro a b ha hb ba ab
    exact unique a ((mem_ordered ..).mp ha) b ((mem_ordered ..).mp hb) (key_eq_of_not ab ba)
  · exact ordered_weak key left
  · exact ordered_weak key right
  · exact (ordered_perm key left).trans (permutation.trans (ordered_perm key right).symm)

def unique {α : Type} [DecidableEq α] : List α → List α
  | [] => []
  | head :: tail => if head ∈ tail then unique tail else head :: unique tail

@[simp] theorem mem_unique {α : Type} [DecidableEq α] (values : List α) (value : α) :
    value ∈ unique values ↔ value ∈ values := by
  induction values with
  | nil => simp [unique]
  | cons head tail ih =>
    by_cases member : head ∈ tail
    · simp only [unique, ite_eq_left member, ih, List.mem_cons]
      exact ⟨Or.inr, fun h => h.elim (fun equal => equal ▸ member) id⟩
    · simp [unique, member, ih]

theorem unique_nodup {α : Type} [DecidableEq α] (values : List α) : (unique values).Nodup := by
  induction values with
  | nil => exact List.nodup_nil
  | cons head tail ih =>
    by_cases member : head ∈ tail
    · simpa [unique, member] using ih
    · simpa [unique, member, List.nodup_cons] using ih

theorem key_injective_on {α β : Type} (key : α → β) {values : List α}
    (distinct : values.Pairwise (fun a b => key a ≠ key b)) :
    ∀ a ∈ values, ∀ b ∈ values, key a = key b → a = b := by
  induction values with
  | nil => simp
  | cons head tail ih =>
    obtain ⟨headDistinct, tailDistinct⟩ := List.pairwise_cons.mp distinct
    intro a aMember b bMember equal
    rcases List.mem_cons.mp aMember with rfl | aTail
    · rcases List.mem_cons.mp bMember with rfl | bTail
      · rfl
      · exact False.elim (headDistinct b bTail equal)
    · rcases List.mem_cons.mp bMember with rfl | bTail
      · exact False.elim (headDistinct a aTail equal.symm)
      · exact ih tailDistinct a aTail b bTail equal

theorem ordered_unique_eq {α : Type} [DecidableEq α] (key : α → Key) (left right : List α)
    (same : ∀ value, value ∈ left ↔ value ∈ right)
    (injective : ∀ a b, key a = key b → a = b) :
    ordered key (unique left) = ordered key (unique right) := by
  apply ordered_eq_of_perm
  · apply (List.perm_ext_iff_of_nodup (unique_nodup left) (unique_nodup right)).mpr
    intro value
    simpa only [mem_unique] using same value
  · intro a _ b _ equal
    exact injective a b equal

def nonempty {α : Type} (values : List α) (present : values ≠ []) : NonemptyList α :=
  match values with
  | [] => False.elim (present rfl)
  | head :: tail => ⟨head, tail⟩

@[simp] theorem nonempty_toList {α : Type} (values : List α) (present : values ≠ []) :
    (nonempty values present).toList = values := by
  cases values with
  | nil => exact False.elim (present rfl)
  | cons _ _ => rfl

end PluginSdk.Compiler
