import PluginSdk.Compatibility.ClientPackages.Model
import PluginSdk.Compatibility.ClientPackages.Properties

namespace PluginSdk.Compatibility.ClientPackages.Proofs

open PluginSdk.Compatibility.ClientPackages

@[simp] private theorem packageProjectionCheck_eq_fit (client : Client) (family : PackageClient) :
    decide (packageClient client = family) = FitsClient client family := by
  cases client <;> cases family <;> rfl

private theorem hasPackageClient_eq_true_iff (packages : List PackageClient)
    (family : PackageClient) :
    hasPackageClient packages family = true ↔ family ∈ packages := by
  simp [hasPackageClient, List.any_eq_true]

private theorem bool_eq_of_true_iff {left right : Bool}
    (equivalent : left = true ↔ right = true) : left = right := by
  cases left <;> cases right <;> simp_all

private theorem requiredClients_mem_iff (input : BuildInput) (family : PackageClient) :
    family ∈ RequiredClients input ↔
      ∃ client ∈ input.toList, FitsClient client family = true := by
  cases family <;>
    simp [RequiredClients, FitsClient, List.mem_filter, List.any_eq_true]

private theorem outputList_eq_filter (claude codex : Bool) :
    (nonempty : claude = true ∨ codex = true) →
    (clientsFromPresence claude codex).toList =
      ([.claudeCode, .codex] : List PackageClient).filter (fun family =>
        match family with
        | .claudeCode => claude
        | .codex => codex) := by
  intro nonempty
  cases claude <;> cases codex
  · simp at nonempty
  · simp [clientsFromPresence, PackageClients.toList]
  · simp [clientsFromPresence, PackageClients.toList]
  · simp [clientsFromPresence, PackageClients.toList]

theorem CB1_family_exact : CB1_family_exact model := by
  intro client
  cases client <;> rfl

theorem CB2_normalization_exact : CB2_normalization_exact model := by
  intro input
  cases input with
  | mk head tail =>
    let clients := head :: tail
    let packages := clients.map packageClient
    have present : hasPackageClient packages .claudeCode = true ∨
        hasPackageClient packages .codex = true := by
      cases head <;> simp [packages, clients, hasPackageClient, packageClient]
    have claudeCheck : hasPackageClient packages .claudeCode =
        clients.any (fun client => FitsClient client .claudeCode) := by
      simp [packages, clients, hasPackageClient, packageProjectionCheck_eq_fit,
        Function.comp_def]
    have codexCheck : hasPackageClient packages .codex =
        clients.any (fun client => FitsClient client .codex) := by
      simp [packages, clients, hasPackageClient, packageProjectionCheck_eq_fit,
        Function.comp_def]
    change (clientsFromPresence (hasPackageClient packages .claudeCode)
      (hasPackageClient packages .codex)).toList = RequiredClients ⟨head, tail⟩
    rw [outputList_eq_filter _ _ present]
    unfold RequiredClients
    apply List.filter_congr
    intro family _
    cases family <;> simp [claudeCheck, codexCheck, clients, NonemptyList.toList]

theorem CB3_coverage_exact : CB3_coverage_exact model := by
  intro input family
  rw [CB2_normalization_exact input]
  exact requiredClients_mem_iff input family

theorem CB4_valid_nonempty_output : CB4_valid_nonempty_output model := by
  intro input
  cases model.buildClients input <;> simp [PackageClients.toList]

theorem CB5_membership_invariant : CB5_membership_invariant model := by
  intro left right sameMembers
  have mappedMembers (family : PackageClient) :
      family ∈ left.toList.map packageClient ↔ family ∈ right.toList.map packageClient := by
    simp only [List.mem_map]
    constructor
    · rintro ⟨client, member, projected⟩
      exact ⟨client, (sameMembers client).mp member, projected⟩
    · rintro ⟨client, member, projected⟩
      exact ⟨client, (sameMembers client).mpr member, projected⟩
  have sameClaude :
      hasPackageClient (left.toList.map packageClient) .claudeCode =
        hasPackageClient (right.toList.map packageClient) .claudeCode := by
    apply bool_eq_of_true_iff
    exact (hasPackageClient_eq_true_iff _ _).trans
      ((mappedMembers .claudeCode).trans (hasPackageClient_eq_true_iff _ _).symm)
  have sameCodex :
      hasPackageClient (left.toList.map packageClient) .codex =
        hasPackageClient (right.toList.map packageClient) .codex := by
    apply bool_eq_of_true_iff
    exact (hasPackageClient_eq_true_iff _ _).trans
      ((mappedMembers .codex).trans (hasPackageClient_eq_true_iff _ _).symm)
  change buildClients left = buildClients right
  simp only [buildClients, sameClaude, sameCodex]

theorem CB6_legacy_and_cursor_conservation :
    CB6_legacy_and_cursor_conservation model := by
  constructor
  · intro family
    cases family <;> rfl
  · intro input
    have projectedSame :
        (replaceCursorInput input).toList.map packageClient =
          input.toList.map packageClient := by
      cases input with
      | mk head tail =>
        have projectedTail (clients : List Client) :
            (clients.map replaceCursor).map packageClient = clients.map packageClient := by
          induction clients with
          | nil => rfl
          | cons client rest inductionHypothesis =>
            simp only [List.map_cons]
            rw [inductionHypothesis]
            cases client <;> rfl
        simp only [replaceCursorInput, NonemptyList.toList, List.map_cons]
        rw [projectedTail]
        cases head <;> rfl
    change buildClients input = buildClients (replaceCursorInput input)
    unfold buildClients
    rw [projectedSame]

end PluginSdk.Compatibility.ClientPackages.Proofs
