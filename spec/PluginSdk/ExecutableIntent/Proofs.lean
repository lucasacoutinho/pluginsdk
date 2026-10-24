import PluginSdk.ExecutableIntent.Model
import PluginSdk.ExecutableIntent.Properties

namespace PluginSdk.ExecutableIntent.Proofs

set_option maxRecDepth 4096 in
set_option maxHeartbeats 2000000 in
theorem EI1_permission_semantics :
    _root_.PluginSdk.ExecutableIntent.EI1_permission_semantics model := by
  unfold _root_.PluginSdk.ExecutableIntent.EI1_permission_semantics
  decide

private theorem executeBits_semantics (bits : PermissionBits) :
    executeBits bits = decide (HasExecute bits) := EI1_permission_semantics bits

private theorem contains_true_iff_mem {α : Type} [BEq α] [LawfulBEq α]
    (items : List α) (item : α) : items.contains item = true ↔ item ∈ items :=
  List.contains_iff_mem

private theorem contains_eq_decide_mem {α : Type} [BEq α] [LawfulBEq α]
    (items : List α) (item : α) : items.contains item = decide (item ∈ items) := by
  cases result : items.contains item
  · have absent : item ∉ items := by
      intro member
      have present := (contains_true_iff_mem items item).2 member
      rw [result] at present
      cases present
    simp [absent]
  · have present : item ∈ items := (contains_true_iff_mem items item).1 result
    simp [present]

private theorem firstDuplicate_none_iff_nodup (items : List String) : firstDuplicate items = none ↔ items.Nodup := by
  induction items with
  | nil => simp [firstDuplicate]
  | cons head tail ih =>
      by_cases duplicate : head ∈ tail
      · have contains : tail.contains head = true :=
          (contains_true_iff_mem tail head).2 duplicate
        simp [firstDuplicate, duplicate, List.nodup_cons]
      · have contains : tail.contains head = false := by
          cases result : tail.contains head with
          | false => rfl
          | true => exact False.elim (duplicate ((contains_true_iff_mem tail head).1 result))
        simp [firstDuplicate, duplicate, ih, List.nodup_cons]

private theorem firstDuplicate_sound (items : List String) (item : String) :
    firstDuplicate items = some item → 2 ≤ items.count item := by
  induction items with
  | nil => simp [firstDuplicate]
  | cons head tail ih =>
      intro found
      by_cases duplicate : head ∈ tail
      · have contains : tail.contains head = true :=
          (contains_true_iff_mem tail head).2 duplicate
        simp [firstDuplicate, duplicate] at found
        subst item
        have positive : 0 < tail.count head := List.count_pos_iff.mpr duplicate
        simp
        omega
      · have contains : tail.contains head = false := by
          cases result : tail.contains head with
          | false => rfl
          | true => exact False.elim (duplicate ((contains_true_iff_mem tail head).1 result))
        have tailFound : firstDuplicate tail = some item := by
          simpa [firstDuplicate, duplicate] using found
        have tailCount := ih tailFound
        have monotone : tail.count item ≤ (head :: tail).count item := by
          by_cases same : head = item
          · subst item
            simp
          · simp [same]
        omega

private theorem findMissing_none_iff {α : Type} [BEq α] [LawfulBEq α] (files declarations : List α) :
    declarations.find? (fun item => !(files.contains item)) = none ↔
      ∀ item ∈ declarations, item ∈ files := by
  induction declarations with
  | nil => simp
  | cons head tail ih =>
      by_cases member : head ∈ files
      · simp [List.find?, member]
      · simp [List.find?, member]

private theorem findMissing_sound {α : Type} [BEq α] [LawfulBEq α]
    (files declarations : List α) (item : α) :
      declarations.find? (fun candidate => !(files.contains candidate)) = some item →
      item ∈ declarations ∧ item ∉ files := by
  induction declarations generalizing item with
  | nil => simp
  | cons head tail ih =>
      intro found
      by_cases member : head ∈ files
      · have tailFound : tail.find? (fun candidate => !(files.contains candidate)) = some item := by
          simpa [List.find?, member] using found
        have result := ih item tailFound
        exact ⟨by simp [result.1], result.2⟩
      · simp [List.find?, member] at found
        cases found
        exact ⟨by simp, member⟩

private theorem nativeFiles_exact :
    ∀ files intents, nativeFiles files = .resolved intents ↔ NativeAssignments files intents := by
  intro files
  induction files with
  | nil =>
      intro intents
      cases intents <;> simp [nativeFiles, NativeAssignments]
  | cons file rest ih =>
      intro intents
      cases intents with
      | nil =>
          cases modeEq : file.mode with
          | posix before after =>
              by_cases stable : before = after
              · cases restResult : nativeFiles rest <;>
                  simp [nativeFiles, nativeIntent, modeEq, stable, restResult, NativeAssignments,
                    executeBits_semantics]
              · simp [nativeFiles, nativeIntent, modeEq, stable, NativeAssignments]
          | unrepresented => simp [nativeFiles, nativeIntent, modeEq, NativeAssignments]
          | unavailable => simp [nativeFiles, nativeIntent, modeEq, NativeAssignments]
      | cons intent tail =>
          cases intent with
          | mk intentPath intentExecutable =>
            cases modeEq : file.mode with
            | posix before after =>
                by_cases stable : before = after
                · cases restResult : nativeFiles rest with
                  | resolved restFiles =>
                      have tailExact : tail = restFiles ↔ NativeAssignments rest tail := by
                        have exact := ih tail
                        rw [restResult] at exact
                        simpa [eq_comm] using exact
                      simp [nativeFiles, nativeIntent, modeEq, stable, restResult, NativeAssignments,
                        NativeAssignment, executeBits_semantics, tailExact, eq_comm]
                  | refused reason path =>
                      have tailImpossible : ¬ NativeAssignments rest tail := by
                        intro assignments
                        have exact := (ih tail).2 assignments
                        rw [restResult] at exact
                        cases exact
                      simp [nativeFiles, nativeIntent, modeEq, stable, restResult, NativeAssignments,
                        NativeAssignment, tailImpossible, eq_comm]
                · simp [nativeFiles, nativeIntent, modeEq, stable, NativeAssignments, NativeAssignment,
                    eq_comm]
            | unrepresented =>
                simp [nativeFiles, nativeIntent, modeEq, NativeAssignments, NativeAssignment]
            | unavailable =>
                simp [nativeFiles, nativeIntent, modeEq, NativeAssignments, NativeAssignment]

private theorem filesystemFault_cons (file : NativeFile) (rest : List NativeFile)
    (reason : SourceReason) (path : String)
    (fault : SourceFault (.filesystem rest) reason path) :
    SourceFault (.filesystem (file :: rest)) reason path := by
  cases reason with
  | duplicateFile =>
      change 2 ≤ (rest.map (·.path)).count path at fault
      change 2 ≤ (file.path :: rest.map (·.path)).count path
      exact Nat.le_trans fault List.count_le_count_cons
  | duplicateDeclaration => exact False.elim fault
  | missingFile => exact False.elim fault
  | unavailable =>
      simp only [SourceFault] at fault ⊢
      rcases fault with ⟨witness, member, pathEq, modeEq⟩
      exact ⟨witness, by simp [member], pathEq, modeEq⟩
  | unrepresented =>
      simp only [SourceFault] at fault ⊢
      rcases fault with ⟨witness, member, pathEq, modeEq⟩
      exact ⟨witness, by simp [member], pathEq, modeEq⟩
  | changed =>
      simp only [SourceFault] at fault ⊢
      rcases fault with ⟨witness, member, pathEq, before, after, modeEq, changed⟩
      exact ⟨witness, by simp [member], pathEq, before, after, modeEq, changed⟩

private theorem nativeFiles_refusal_fault :
    ∀ files reason path, nativeFiles files = .refused reason path →
      SourceFault (.filesystem files) reason path := by
  intro files
  induction files with
  | nil =>
      intro reason path refused
      simp [nativeFiles] at refused
  | cons file rest ih =>
      intro reason path refused
      cases modeEq : file.mode with
      | unavailable =>
          have fields : sourceReason .unavailable = reason ∧ file.path = path := by
            simpa [nativeFiles, nativeIntent, modeEq] using refused
          rcases fields with ⟨rfl, rfl⟩
          simp [SourceFault, sourceReason, modeEq]
      | unrepresented =>
          have fields : sourceReason .unrepresented = reason ∧ file.path = path := by
            simpa [nativeFiles, nativeIntent, modeEq] using refused
          rcases fields with ⟨rfl, rfl⟩
          simp [SourceFault, sourceReason, modeEq]
      | posix before after =>
          by_cases stable : before = after
          · cases restResult : nativeFiles rest with
            | resolved resolved =>
                simp [nativeFiles, nativeIntent, modeEq, stable, restResult] at refused
            | refused tailReason tailPath =>
                have fields : tailReason = reason ∧ tailPath = path := by
                  simpa [nativeFiles, nativeIntent, modeEq, stable, restResult] using refused
                rcases fields with ⟨rfl, rfl⟩
                exact filesystemFault_cons file rest tailReason tailPath
                  (ih tailReason tailPath restResult)
          · have fields : sourceReason .changed = reason ∧ file.path = path := by
              simpa [nativeFiles, nativeIntent, modeEq, stable] using refused
            rcases fields with ⟨rfl, rfl⟩
            simpa [SourceFault, sourceReason, modeEq] using
              (show ∃ witness ∈ file :: rest, witness.path = file.path ∧
                ∃ before after, witness.mode = .posix before after ∧ before ≠ after from
                ⟨file, by simp, rfl, before, after, modeEq, stable⟩)

private theorem nativeAssignments_paths :
    ∀ {files intents}, NativeAssignments files intents →
      intents.map (·.path) = files.map (·.path) := by
  intro files
  induction files with
  | nil =>
      intro intents assignments
      cases intents <;> simp [NativeAssignments] at assignments ⊢
  | cons native rest ih =>
      intro intents assignments
      cases intents with
      | nil => simp [NativeAssignments] at assignments
      | cons intent tail =>
          simp only [NativeAssignments] at assignments
          rcases assignments with ⟨assignment, tailAssignments⟩
          rcases assignment with ⟨pathEq, _⟩
          have tailPaths := ih tailAssignments
          change intent.path :: tail.map (·.path) = native.path :: rest.map (·.path)
          rw [← pathEq, tailPaths]

private theorem nativeAssignments_usable :
    ∀ {files intents}, NativeAssignments files intents →
      ∀ file ∈ files, ¬ ModeUnusable file.mode := by
  intro files
  induction files with
  | nil => simp
  | cons native rest ih =>
      intro intents assignments file member unusable
      cases intents with
      | nil => simp [NativeAssignments] at assignments
      | cons intent tail =>
          simp only [NativeAssignments] at assignments
          rcases assignments with ⟨assignment, tailAssignments⟩
          simp only [List.mem_cons] at member
          rcases member with rfl | member
          · rcases assignment with ⟨_, bits, modeEq, _⟩
            simp [ModeUnusable, modeEq] at unusable
          · exact ih tailAssignments file member unusable

private theorem contains_perm_eq {α : Type} [BEq α] [LawfulBEq α] {left right : List α} (item : α)
    (permutation : left.Perm right) : left.contains item = right.contains item := by
  cases leftResult : left.contains item <;> cases rightResult : right.contains item
  · rfl
  · have rightMember : item ∈ right := (contains_true_iff_mem right item).1 rightResult
    have leftMember : item ∈ left := permutation.mem_iff.mpr rightMember
    have leftTrue : left.contains item = true := (contains_true_iff_mem left item).2 leftMember
    rw [leftResult] at leftTrue
    contradiction
  · have leftMember : item ∈ left := (contains_true_iff_mem left item).1 leftResult
    have rightMember : item ∈ right := permutation.mem_iff.mp leftMember
    have rightTrue : right.contains item = true := (contains_true_iff_mem right item).2 rightMember
    rw [rightResult] at rightTrue
    contradiction
  · rfl

private theorem declaredFiles_perm (files : List String) (left right : List String)
    (permutation : left.Perm right) : DeclaredFiles files left = DeclaredFiles files right := by
  induction files with
  | nil => rfl
  | cons path rest ih =>
      simp only [DeclaredFiles, List.map_cons]
      have headEq : ({ path := path, executable := left.contains path } : FileIntent) =
          { path := path, executable := right.contains path } := by
        rw [contains_perm_eq path permutation]
      have tailEq : rest.map (fun path => ({ path := path, executable := left.contains path } : FileIntent)) =
          rest.map (fun path => ({ path := path, executable := right.contains path } : FileIntent)) := by
        simpa [DeclaredFiles] using ih
      rw [headEq, tailEq]

theorem EI2_filesystem_resolution_exact :
    _root_.PluginSdk.ExecutableIntent.EI2_filesystem_resolution_exact model := by
  intro files resolved
  change resolveSource (.filesystem files) = .resolved resolved ↔
    (files.map (·.path)).Nodup ∧ NativeAssignments files resolved
  constructor
  · intro accepted
    change resolveSource (.filesystem files) = .resolved resolved at accepted
    unfold resolveSource at accepted
    simp only [SourceInput.paths] at accepted
    cases duplicate : firstDuplicate (files.map (·.path)) with
    | some path => simp [duplicate] at accepted
    | none =>
        have pathsNodup := (firstDuplicate_none_iff_nodup _).1 duplicate
        simp [duplicate] at accepted
        exact ⟨pathsNodup, (nativeFiles_exact files resolved).1 accepted⟩
  · rintro ⟨pathsNodup, assignments⟩
    have duplicateNone : firstDuplicate (files.map (·.path)) = none :=
      (firstDuplicate_none_iff_nodup _).2 pathsNodup
    unfold resolveSource
    simp [SourceInput.paths, duplicateNone, (nativeFiles_exact files resolved).2 assignments]

theorem EI3_declaration_resolution_exact :
    _root_.PluginSdk.ExecutableIntent.EI3_declaration_resolution_exact model := by
  intro files executables resolved
  change resolveSource (.declared files executables) = .resolved resolved ↔
    DeclaredReady files executables ∧ resolved = DeclaredFiles files executables
  constructor
  · intro accepted
    change resolveSource (.declared files executables) = .resolved resolved at accepted
    unfold resolveSource at accepted
    simp only [SourceInput.paths] at accepted
    cases filesDuplicate : firstDuplicate files with
    | some path =>
        simp only [filesDuplicate] at accepted
        cases accepted
    | none =>
        cases declarationsDuplicate : firstDuplicate executables with
        | some path =>
            simp only [filesDuplicate, declarationsDuplicate] at accepted
            cases accepted
        | none =>
            cases missing : executables.find? (fun path => !(files.contains path)) with
            | some path =>
                simp only [filesDuplicate, declarationsDuplicate, missing] at accepted
                cases accepted
            | none =>
                have filesNodup := (firstDuplicate_none_iff_nodup _).1 filesDuplicate
                have declarationsNodup :=
                  (firstDuplicate_none_iff_nodup _).1 declarationsDuplicate
                have covered := (findMissing_none_iff files executables).1 missing
                simp only [filesDuplicate, declarationsDuplicate, missing] at accepted
                injection accepted with outputEq
                subst resolved
                exact ⟨⟨filesNodup, declarationsNodup, covered⟩, rfl⟩
  · rintro ⟨ready, rfl⟩
    rcases ready with ⟨filesNodup, declarationsNodup, covered⟩
    have filesDuplicate : firstDuplicate files = none :=
      (firstDuplicate_none_iff_nodup _).2 filesNodup
    have declarationsDuplicate : firstDuplicate executables = none :=
      (firstDuplicate_none_iff_nodup _).2 declarationsNodup
    have missing : executables.find? (fun path => !(files.contains path)) = none :=
      (findMissing_none_iff files executables).2 covered
    unfold resolveSource
    simp only [SourceInput.paths, filesDuplicate, declarationsDuplicate, missing]

theorem EI4_source_paths_preserved :
    _root_.PluginSdk.ExecutableIntent.EI4_source_paths_preserved model := by
  intro input resolved accepted
  cases input with
  | filesystem files =>
      have exact := (EI2_filesystem_resolution_exact files resolved).1 accepted
      simpa [SourceInput.paths] using nativeAssignments_paths exact.2
  | declared files executables =>
      have exact := (EI3_declaration_resolution_exact files executables resolved).1 accepted
      rcases exact with ⟨_, outputEq⟩
      rw [outputEq]
      simp [SourceInput.paths, DeclaredFiles, Function.comp_def, List.map_map]

theorem EI5_unusable_source_modes_refuse :
    _root_.PluginSdk.ExecutableIntent.EI5_unusable_source_modes_refuse model := by
  intro files file resolved member unusable accepted
  have exact := (EI2_filesystem_resolution_exact files resolved).1 accepted
  exact (nativeAssignments_usable exact.2 file member) unusable

theorem EI6_duplicate_source_paths_refuse :
    _root_.PluginSdk.ExecutableIntent.EI6_duplicate_source_paths_refuse model := by
  intro input resolved duplicate accepted
  cases input with
  | filesystem files =>
      have exact := (EI2_filesystem_resolution_exact files resolved).1 accepted
      exact duplicate exact.1
  | declared files executables =>
      have exact := (EI3_declaration_resolution_exact files executables resolved).1 accepted
      exact duplicate exact.1.1

theorem EI7_invalid_declarations_refuse :
    _root_.PluginSdk.ExecutableIntent.EI7_invalid_declarations_refuse model := by
  intro files executables resolved invalid accepted
  have exact := (EI3_declaration_resolution_exact files executables resolved).1 accepted
  have ready := exact.1
  rcases ready with ⟨_, declarationsNodup, covered⟩
  rcases invalid with duplicate | missing
  · exact duplicate declarationsNodup
  · rcases missing with ⟨path, member, absent⟩
    exact absent (covered path member)

theorem EI8_declaration_membership_exact :
    _root_.PluginSdk.ExecutableIntent.EI8_declaration_membership_exact model := by
  intro files executables resolved file accepted member
  have exact := (EI3_declaration_resolution_exact files executables resolved).1 accepted
  have outputEq := exact.2
  rw [outputEq] at member
  simp only [DeclaredFiles, List.mem_map] at member
  rcases member with ⟨path, _, fileEq⟩
  cases fileEq
  rfl

theorem EI9_declaration_order_independent :
    _root_.PluginSdk.ExecutableIntent.EI9_declaration_order_independent model := by
  intro files executables other ready permutation
  have otherReady : DeclaredReady files other := by
    rcases ready with ⟨filesNodup, declarationsNodup, covered⟩
    refine ⟨filesNodup, permutation.nodup_iff.mp declarationsNodup, ?_⟩
    intro path member
    exact covered path (permutation.mem_iff.mpr member)
  have outputs := declaredFiles_perm files executables other permutation
  calc
    model.source (.declared files executables) = .resolved (DeclaredFiles files executables) :=
      (EI3_declaration_resolution_exact files executables
        (DeclaredFiles files executables)).2 ⟨ready, rfl⟩
    _ = .resolved (DeclaredFiles files other) := by rw [outputs]
    _ = model.source (.declared files other) :=
      ((EI3_declaration_resolution_exact files other
        (DeclaredFiles files other)).2 ⟨otherReady, rfl⟩).symm

theorem EI10_payload_resolution_exact :
    _root_.PluginSdk.ExecutableIntent.EI10_payload_resolution_exact model := by
  intro input executable
  by_cases paths : input.retained.path = input.observed.path
  · by_cases digests : input.retained.digest = input.observed.digest
    · cases mode : input.observed.mode with
      | unavailable => simp [model, resolvePayload, PayloadReady, Bound, paths, digests, mode, ModeMatches]
      | unrepresented => simp [model, resolvePayload, PayloadReady, Bound, paths, digests, mode, ModeMatches, eq_comm]
      | posix before after =>
        by_cases stable : before = after
        · subst after
          by_cases intent : input.retained.executable = decide (HasExecute before) <;>
            simp [model, resolvePayload, PayloadReady, Bound, paths, digests, mode, ModeMatches,
              intent, executeBits_semantics, eq_comm]
        · simp [model, resolvePayload, PayloadReady, Bound, paths, digests, mode, ModeMatches, stable]
    · simp [model, resolvePayload, PayloadReady, Bound, paths, digests]
  · simp [model, resolvePayload, PayloadReady, Bound, paths]

theorem EI11_payload_binding_refuses :
    _root_.PluginSdk.ExecutableIntent.EI11_payload_binding_refuses model := by
  intro input executable unbound accepted
  have ready := (EI10_payload_resolution_exact input executable).1 accepted
  exact unbound ready.1.1

theorem EI12_payload_native_drift_refuses :
    _root_.PluginSdk.ExecutableIntent.EI12_payload_native_drift_refuses model := by
  intro input before after executable modeEq drift accepted
  have ready := (EI10_payload_resolution_exact input executable).1 accepted
  have modeReady : ModeMatches input.retained.executable input.observed.mode := ready.1.2
  rw [modeEq] at modeReady
  change before = after ∧ input.retained.executable = decide (HasExecute before) at modeReady
  rcases modeReady with ⟨stable, intentMatches⟩
  rcases drift with changed | intentMismatch
  · exact changed stable
  · exact intentMismatch intentMatches

theorem EI13_unrepresented_intent_preserved :
    _root_.PluginSdk.ExecutableIntent.EI13_unrepresented_intent_preserved model := by
  intro input bound modeEq
  simp [model, resolvePayload, bound.1, bound.2, modeEq]

theorem EI14_unavailable_payload_refuses :
    _root_.PluginSdk.ExecutableIntent.EI14_unavailable_payload_refuses model := by
  intro input executable modeEq accepted
  have ready := (EI10_payload_resolution_exact input executable).1 accepted
  have modeReady := ready.1.2
  rw [modeEq] at modeReady
  exact modeReady

theorem EI15_source_refusal_witness :
    _root_.PluginSdk.ExecutableIntent.EI15_source_refusal_witness model := by
  intro input reason path refused
  cases input with
  | filesystem files =>
      change resolveSource (.filesystem files) = .refused reason path at refused
      unfold resolveSource at refused
      cases duplicate : firstDuplicate (files.map (·.path)) with
      | some duplicatePath =>
          have fields : SourceReason.duplicateFile = reason ∧ duplicatePath = path := by
            simpa [SourceInput.paths, duplicate] using refused
          rcases fields with ⟨rfl, rfl⟩
          simpa [SourceFault, SourceInput.paths, Duplicated] using
            firstDuplicate_sound (files.map (·.path)) duplicatePath duplicate
      | none =>
          have tailRefusal : nativeFiles files = .refused reason path := by
            simpa [SourceInput.paths, duplicate] using refused
          exact nativeFiles_refusal_fault files reason path tailRefusal
  | declared files executables =>
      change resolveSource (.declared files executables) = .refused reason path at refused
      unfold resolveSource at refused
      cases filesDuplicate : firstDuplicate files with
      | some duplicatePath =>
          have fields : SourceReason.duplicateFile = reason ∧ duplicatePath = path := by
            simpa [SourceInput.paths, filesDuplicate] using refused
          rcases fields with ⟨rfl, rfl⟩
          simpa [SourceFault, SourceInput.paths, Duplicated] using
            firstDuplicate_sound files duplicatePath filesDuplicate
      | none =>
          cases declarationsDuplicate : firstDuplicate executables with
          | some duplicatePath =>
              have fields : SourceReason.duplicateDeclaration = reason ∧ duplicatePath = path := by
                simpa [SourceInput.paths, filesDuplicate, declarationsDuplicate] using refused
              rcases fields with ⟨rfl, rfl⟩
              simpa [SourceFault, Duplicated] using
                firstDuplicate_sound executables duplicatePath declarationsDuplicate
          | none =>
              cases missingNormalized : executables.find? (fun candidate => !decide (candidate ∈ files)) with
              | some missingPath =>
                  have fields : SourceReason.missingFile = reason ∧ missingPath = path := by
                    simpa [SourceInput.paths, filesDuplicate, declarationsDuplicate, missingNormalized] using refused
                  rcases fields with ⟨rfl, rfl⟩
                  have missing : executables.find? (fun candidate => !(files.contains candidate)) = some missingPath := by
                    simpa [contains_eq_decide_mem] using missingNormalized
                  exact findMissing_sound files executables missingPath missing
              | none =>
                  simp [SourceInput.paths, filesDuplicate, declarationsDuplicate,
                    missingNormalized] at refused

theorem EI16_payload_refusal_witness :
    _root_.PluginSdk.ExecutableIntent.EI16_payload_refusal_witness model := by
  intro input reason refused
  change resolvePayload input = .refused reason at refused
  cases reason with
  | path =>
      change input.retained.path ≠ input.observed.path
      by_cases paths : input.retained.path = input.observed.path
      · by_cases digests : input.retained.digest = input.observed.digest
        · cases mode : input.observed.mode with
          | unavailable => simp [resolvePayload, paths, digests, mode] at refused
          | unrepresented => simp [resolvePayload, paths, digests, mode] at refused
          | posix before after =>
              by_cases stable : before = after
              · subst after
                by_cases intent : executeBits before = input.retained.executable <;>
                  simp [resolvePayload, paths, digests, mode, intent] at refused
              · simp [resolvePayload, paths, digests, mode, stable] at refused
        · cases mode : input.observed.mode with
          | unavailable => simp [resolvePayload, paths, digests] at refused
          | unrepresented => simp [resolvePayload, paths, digests] at refused
          | posix before after => simp [resolvePayload, paths, digests] at refused
      · exact paths
  | content =>
      change input.retained.digest ≠ input.observed.digest
      by_cases paths : input.retained.path = input.observed.path
      · by_cases digests : input.retained.digest = input.observed.digest
        · cases mode : input.observed.mode with
          | unavailable => simp [resolvePayload, paths, digests, mode] at refused
          | unrepresented => simp [resolvePayload, paths, digests, mode] at refused
          | posix before after =>
              by_cases stable : before = after
              · subst after
                by_cases intent : executeBits before = input.retained.executable <;>
                  simp [resolvePayload, paths, digests, mode, intent] at refused
              · simp [resolvePayload, paths, digests, mode, stable] at refused
        · exact digests
      · simp [resolvePayload, paths] at refused
  | unavailable =>
      change input.observed.mode = .unavailable
      by_cases paths : input.retained.path = input.observed.path
      · by_cases digests : input.retained.digest = input.observed.digest
        · cases mode : input.observed.mode with
          | unavailable => rfl
          | unrepresented => simp [resolvePayload, paths, digests, mode] at refused
          | posix before after =>
              by_cases stable : before = after
              · subst after
                by_cases intent : executeBits before = input.retained.executable <;>
                  simp [resolvePayload, paths, digests, mode, intent] at refused
              · simp [resolvePayload, paths, digests, mode, stable] at refused
        · simp [resolvePayload, paths, digests] at refused
      · simp [resolvePayload, paths] at refused
  | changed =>
      change ∃ before after, input.observed.mode = .posix before after ∧ before ≠ after
      by_cases paths : input.retained.path = input.observed.path
      · by_cases digests : input.retained.digest = input.observed.digest
        · cases mode : input.observed.mode with
          | unavailable => simp [resolvePayload, paths, digests, mode] at refused
          | unrepresented => simp [resolvePayload, paths, digests, mode] at refused
          | posix before after =>
              by_cases stable : before = after
              · subst after
                by_cases intent : executeBits before = input.retained.executable <;>
                  simp [resolvePayload, paths, digests, mode, intent] at refused
              · exact ⟨before, after, rfl, stable⟩
        · simp [resolvePayload, paths, digests] at refused
      · simp [resolvePayload, paths] at refused
  | intent =>
      change ∃ before after, input.observed.mode = .posix before after ∧
        input.retained.executable ≠ decide (HasExecute before)
      by_cases paths : input.retained.path = input.observed.path
      · by_cases digests : input.retained.digest = input.observed.digest
        · cases mode : input.observed.mode with
          | unavailable => simp [resolvePayload, paths, digests, mode] at refused
          | unrepresented => simp [resolvePayload, paths, digests, mode] at refused
          | posix before after =>
              by_cases stable : before = after
              · subst after
                have executeMismatch : executeBits before ≠ input.retained.executable := by
                  by_cases intent : executeBits before = input.retained.executable
                  · simp [resolvePayload, paths, digests, mode, intent] at refused
                  · exact intent
                refine ⟨before, before, rfl, ?_⟩
                intro intentEq
                apply executeMismatch
                rw [executeBits_semantics, intentEq]
              · simp [resolvePayload, paths, digests, mode, stable] at refused
        · simp [resolvePayload, paths, digests] at refused
      · simp [resolvePayload, paths] at refused

set_option maxRecDepth 8192 in
set_option maxHeartbeats 5000000 in
theorem EI17_stage_intent_exact :
    _root_.PluginSdk.ExecutableIntent.EI17_stage_intent_exact model := by
  unfold _root_.PluginSdk.ExecutableIntent.EI17_stage_intent_exact
  decide

set_option maxRecDepth 8192 in
set_option maxHeartbeats 5000000 in
theorem EI18_stage_data_bits_preserved :
    _root_.PluginSdk.ExecutableIntent.EI18_stage_data_bits_preserved model := by
  unfold _root_.PluginSdk.ExecutableIntent.EI18_stage_data_bits_preserved
  decide

set_option maxRecDepth 8192 in
set_option maxHeartbeats 5000000 in
theorem EI19_stage_matching_bits_preserved :
    _root_.PluginSdk.ExecutableIntent.EI19_stage_matching_bits_preserved model := by
  unfold _root_.PluginSdk.ExecutableIntent.EI19_stage_matching_bits_preserved
  decide

set_option maxRecDepth 8192 in
set_option maxHeartbeats 5000000 in
theorem EI20_stage_owner_bit_only :
    _root_.PluginSdk.ExecutableIntent.EI20_stage_owner_bit_only model := by
  unfold _root_.PluginSdk.ExecutableIntent.EI20_stage_owner_bit_only
  decide

end PluginSdk.ExecutableIntent.Proofs
