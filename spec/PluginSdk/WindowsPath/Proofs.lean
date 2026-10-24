import PluginSdk.WindowsPath.Model
import PluginSdk.WindowsPath.Properties

namespace PluginSdk.WindowsPath.Proofs

private theorem no_component_overflow_iff_bounds (input : Input) :
    ¬ HasComponentOverflow input ↔ ComponentWithinLimits input := by
  unfold HasComponentOverflow hasComponentOverflow ComponentWithinLimits
  simp only [List.any_eq_true, decide_eq_true_eq]
  constructor
  · intro noOverflow component member
    by_cases overLimit : utf16Units component > input.capacity.maxComponentUnits
    · exact False.elim (noOverflow ⟨component, member, overLimit⟩)
    · omega
  · intro withinBounds overflow
    rcases overflow with ⟨component, member, overLimit⟩
    have inBounds := withinBounds component member
    omega

theorem WP1_admission_exact : WP1_admission_exact model := by
  intro input
  change classify input = .accepted ↔ AdmissionFacts input
  simp only [AdmissionFacts]
  rw [← no_component_overflow_iff_bounds input]
  by_cases syntaxCase : HasSyntax input.path <;>
    by_cases device : HasDevice input.path <;>
    by_cases componentOverflow : HasComponentOverflow input <;>
    by_cases pathWithin : PathWithinLimit input <;>
    simp_all [classify]

theorem WP2_syntax_exact : WP2_syntax_exact model := by
  intro input
  change classify input = .syntax ↔ HasSyntax input.path
  by_cases syntaxCase : HasSyntax input.path <;>
    by_cases device : HasDevice input.path <;>
    by_cases componentOverflow : HasComponentOverflow input <;>
    by_cases pathWithin : PathWithinLimit input <;>
    simp_all [classify]

theorem WP3_device_exact : WP3_device_exact model := by
  intro input
  change classify input = .device ↔
    ¬ HasSyntax input.path ∧ HasDevice input.path
  by_cases syntaxCase : HasSyntax input.path <;>
    by_cases device : HasDevice input.path <;>
    by_cases componentOverflow : HasComponentOverflow input <;>
    by_cases pathWithin : PathWithinLimit input <;>
    simp_all [classify]

theorem WP4_component_limit_exact : WP4_component_limit_exact model := by
  intro input
  change classify input = .componentLimit ↔
    ¬ HasSyntax input.path ∧ ¬ HasDevice input.path ∧ HasComponentOverflow input
  by_cases syntaxCase : HasSyntax input.path <;>
    by_cases device : HasDevice input.path <;>
    by_cases componentOverflow : HasComponentOverflow input <;>
    by_cases pathWithin : PathWithinLimit input <;>
    simp_all [classify]

theorem WP5_path_limit_exact : WP5_path_limit_exact model := by
  intro input
  change classify input = .pathLimit ↔
    ¬ HasSyntax input.path ∧ ¬ HasDevice input.path ∧
      ComponentWithinLimits input ∧ ¬ PathWithinLimit input
  rw [← no_component_overflow_iff_bounds input]
  by_cases syntaxCase : HasSyntax input.path <;>
    by_cases device : HasDevice input.path <;>
    by_cases componentOverflow : HasComponentOverflow input <;>
    by_cases pathWithin : PathWithinLimit input <;>
    simp_all [classify]

theorem WP6_capacity_monotone : WP6_capacity_monotone model := by
  intro path oldCapacity newCapacity componentCapacity pathCapacity oldAccepted
  have oldFacts : AdmissionFacts ⟨path, oldCapacity⟩ :=
    (WP1_admission_exact ⟨path, oldCapacity⟩).mp oldAccepted
  rcases oldFacts with ⟨noSyntax, noDevice, oldComponents, oldPath⟩
  have newComponents : ComponentWithinLimits ⟨path, newCapacity⟩ := by
    intro component member
    have oldBound : utf16Units component ≤ oldCapacity.maxComponentUnits :=
      oldComponents component member
    change utf16Units component ≤ newCapacity.maxComponentUnits
    omega
  have newPath : PathWithinLimit ⟨path, newCapacity⟩ := by
    change utf16Units path.value ≤ newCapacity.remainingPathUnits
    have oldBound : utf16Units path.value ≤ oldCapacity.remainingPathUnits := oldPath
    omega
  apply (WP1_admission_exact ⟨path, newCapacity⟩).mpr
  exact ⟨noSyntax, noDevice, newComponents, newPath⟩

theorem WP7_colon_refuses : WP7_colon_refuses model := by
  intro input containsColon
  have syntaxFact : HasSyntax input.path := by
    rcases containsColon with ⟨component, member, colonMember⟩
    have badCharacter : badSyntaxCharacter ':' = true := by simp [badSyntaxCharacter]
    have badCharacters : component.toList.any badSyntaxCharacter = true :=
      List.any_eq_true.mpr ⟨':', colonMember, badCharacter⟩
    change hasSyntax input.path = true
    unfold hasSyntax
    apply List.any_eq_true.mpr
    refine ⟨component, member, ?_⟩
    unfold badSyntaxComponent
    simp [badCharacters]
  have classified : model.classify input = .syntax :=
    (WP2_syntax_exact input).mpr syntaxFact
  simp [classified]

theorem WP8_accepted_limits : WP8_accepted_limits model := by
  intro input accepted
  rcases (WP1_admission_exact input).mp accepted with
    ⟨_, _, componentBounds, pathBound⟩
  exact ⟨componentBounds, pathBound⟩

theorem WP9_supplementary_boundary : WP9_supplementary_boundary model := by
  unfold _root_.PluginSdk.WindowsPath.WP9_supplementary_boundary
  decide +kernel

end PluginSdk.WindowsPath.Proofs
