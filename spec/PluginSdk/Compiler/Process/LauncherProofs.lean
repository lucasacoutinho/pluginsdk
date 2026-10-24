import PluginSdk.Compiler.Process.Launcher
import PluginSdk.Compiler.Canonical
import PluginSdk.Compiler.Process.Facts

namespace PluginSdk.Compiler.Process.Launcher.Proofs

private theorem fallback_ne_placeholder (name : EnvironmentName) :
    fallback ≠ placeholder name := by
  intro equal
  have chars := congrArg String.toList equal
  simp [fallback, placeholder, String.toList_append] at chars

private def EnvironmentCharacter (character : Char) : Prop :=
  AsciiLetter character ∨ ('0' ≤ character ∧ character ≤ '9') ∨ character = '_'

private theorem environmentName_characters (name : EnvironmentName) :
    ∀ character ∈ name.value.toList, EnvironmentCharacter character := by
  rcases name.valid with ⟨first, rest, chars, firstValid, restValid⟩
  intro character member
  rw [chars] at member
  rcases List.mem_cons.mp member with firstMember | restMember
  · cases firstValid with
    | inl letter => exact Or.inl (firstMember ▸ letter)
    | inr underscore => exact Or.inr (Or.inr (firstMember ▸ underscore))
  · exact restValid character restMember

private def freshPrefix (names : List EnvironmentName) : List Char :=
  "PSDK_".toList ++ List.replicate (bound names) '_'

private theorem freshName_characters (names : List EnvironmentName) (kind : Kind)
    (source : EnvironmentName) :
    (freshName names kind source).toList =
      freshPrefix names ++ ([marker kind, '_'] ++ source.value.toList) := by
  simp [freshPrefix, freshName, String.toList_append]

private theorem freshPrefix_length (names : List EnvironmentName) :
    (freshPrefix names).length = 5 + bound names := by
  simp [freshPrefix]
  omega

theorem freshName_length (names : List EnvironmentName) (kind : Kind)
    (source : EnvironmentName) :
    (freshName names kind source).toList.length =
      5 + bound names + 2 + source.value.toList.length := by
  rw [freshName_characters]
  simp only [List.length_append, List.length_cons, List.length_nil]
  rw [freshPrefix_length]
  omega

theorem bound_covers (names : List EnvironmentName) (name : EnvironmentName)
    (member : name ∈ names) : name.value.toList.length ≤ bound names := by
  induction names with
  | nil => simp at member
  | cons head tail ih =>
      simp only [List.mem_cons] at member
      simp only [bound]
      rcases member with equal | member
      · subst head
        exact Nat.le_max_left _ _
      · exact Nat.le_trans (ih member) (Nat.le_max_right _ _)

theorem freshName_valid (names : List EnvironmentName) (kind : Kind)
    (source : EnvironmentName) : ValidEnvironmentName (freshName names kind source) := by
  let tail := ['S', 'D', 'K', '_'] ++ (List.replicate (bound names) '_' ++
    ([marker kind, '_'] ++ source.value.toList))
  have chars : (freshName names kind source).toList = 'P' :: tail := by
    rw [freshName_characters]
    simp [freshPrefix, tail]
  have tailCharacters : ∀ character ∈ tail, EnvironmentCharacter character := by
    intro character member
    change character ∈ (['S', 'D', 'K', '_'] ++ (List.replicate (bound names) '_' ++
      ([marker kind, '_'] ++ source.value.toList))) at member
    rcases List.mem_append.mp member with fixedPrefix | suffix
    · rcases List.mem_cons.mp fixedPrefix with first | rest
      · subst character
        simp [EnvironmentCharacter, AsciiLetter]
      · rcases List.mem_cons.mp rest with second | rest
        · subst character
          simp [EnvironmentCharacter, AsciiLetter]
        · rcases List.mem_cons.mp rest with third | rest
          · subst character
            simp [EnvironmentCharacter, AsciiLetter]
          · rcases List.mem_cons.mp rest with underscore | rest
            · subst character
              simp [EnvironmentCharacter, AsciiLetter]
            · simp at rest
    · rcases List.mem_append.mp suffix with repeated | suffix
      · rcases List.mem_replicate.mp repeated with ⟨_, underscore⟩
        subst character
        simp [EnvironmentCharacter, AsciiLetter]
      · rcases List.mem_append.mp suffix with markerMember | sourceMember
        · rcases List.mem_cons.mp markerMember with markerEqual | rest
          · subst character
            cases kind <;> simp [marker, EnvironmentCharacter, AsciiLetter]
          · rcases List.mem_cons.mp rest with underscoreEqual | rest
            · subst character
              simp [EnvironmentCharacter, AsciiLetter]
            · simp at rest
        · exact environmentName_characters source character sourceMember
  unfold ValidEnvironmentName
  refine ⟨'P', tail, chars, ?_, tailCharacters⟩
  simp [AsciiLetter]

theorem freshName_ne_requested (names : List EnvironmentName) (kind : Kind)
    (source name : EnvironmentName) (member : name ∈ names) :
    freshName names kind source ≠ name.value := by
  intro equal
  have lengths := congrArg (fun value : String => value.toList.length) equal
  rw [freshName_length] at lengths
  have requestedLength := bound_covers names name member
  omega

theorem freshName_injective (names : List EnvironmentName)
    (leftKind rightKind : Kind) (leftSource rightSource : EnvironmentName)
    (equal : freshName names leftKind leftSource = freshName names rightKind rightSource) :
    leftKind = rightKind ∧ leftSource = rightSource := by
  have chars := congrArg String.toList equal
  rw [freshName_characters, freshName_characters] at chars
  have suffix := List.append_cancel_left chars
  cases leftKind <;> cases rightKind <;>
    simp [marker, String.toList_inj] at suffix
  all_goals exact ⟨rfl, environmentName_eq_of_value_eq suffix⟩

private theorem sourceNames_mem (plan : Plan) (name : EnvironmentName) :
    name ∈ sourceNames plan ↔ name ∈ (words plan).flatMap references := by
  simp [sourceNames]

private def freshPairNames (names : List EnvironmentName) (source : EnvironmentName) : List String :=
  [freshName names .raw source, freshName names .check source]

private theorem freshPairNames_nodup (names : List EnvironmentName)
    (source : EnvironmentName) : (freshPairNames names source).Nodup := by
  change (freshName names .raw source :: [freshName names .check source]).Nodup
  rw [List.nodup_cons]
  constructor
  · intro member
    have equal : freshName names .raw source = freshName names .check source := by
      simpa using member
    have kindEqual := (freshName_injective names .raw .check source source equal).1
    exact (by decide : Kind.raw ≠ Kind.check) kindEqual
  · simp

private theorem freshPairNames_source_eq (names : List EnvironmentName)
    {source other : EnvironmentName} {left right : String}
    (leftMember : left ∈ freshPairNames names source)
    (rightMember : right ∈ freshPairNames names other) (equal : left = right) :
    source = other := by
  have leftForm : ∃ kind, left = freshName names kind source := by
    simp [freshPairNames] at leftMember
    rcases leftMember with leftRaw | leftCheck
    · exact ⟨.raw, leftRaw⟩
    · exact ⟨.check, leftCheck⟩
  have rightForm : ∃ kind, right = freshName names kind other := by
    simp [freshPairNames] at rightMember
    rcases rightMember with rightRaw | rightCheck
    · exact ⟨.raw, rightRaw⟩
    · exact ⟨.check, rightCheck⟩
  obtain ⟨leftKind, leftEq⟩ := leftForm
  obtain ⟨rightKind, rightEq⟩ := rightForm
  have same : freshName names leftKind source = freshName names rightKind other :=
    leftEq.symm.trans (equal.trans rightEq)
  exact (freshName_injective names leftKind rightKind source other same).2

private theorem freshPairs_nodup (names : List EnvironmentName)
    (sources : List EnvironmentName) (distinct : sources.Nodup) :
    (sources.flatMap (freshPairNames names)).Nodup := by
  induction sources with
  | nil => simp
  | cons source rest ih =>
      obtain ⟨sourceNotInRest, restDistinct⟩ := List.nodup_cons.mp distinct
      rw [List.flatMap_cons]
      apply List.nodup_append.mpr
      refine ⟨freshPairNames_nodup names source, ih restDistinct, ?_⟩
      intro left leftMember right rightMember equal
      obtain ⟨other, otherMember, rightWithin⟩ := List.mem_flatMap.mp rightMember
      have sourceDifferent : source ≠ other := by
        intro same
        exact sourceNotInRest (same ▸ otherMember)
      have sourceEqual := freshPairNames_source_eq names leftMember rightWithin equal
      exact sourceDifferent sourceEqual

private theorem sourceNames_nodup (plan : Plan) : (sourceNames plan).Nodup := by
  have sorted := ordered_perm (fun name : EnvironmentName => [name.value])
    (unique ((words plan).flatMap references))
  exact sorted.nodup_iff.mpr (unique_nodup _)

private theorem captureNames_eq (plan : Plan) :
    ((compile plan).captures.flatMap (fun capture => [capture.raw, capture.check])) =
      (sourceNames plan).flatMap (freshPairNames (requestedNames plan)) := by
  simp only [compile, List.flatMap_map, captureFor]
  rfl

private theorem captured_snapshot_mem (plan : Plan) (capture : Capture) :
    .captured capture ∈ (compile plan).snapshot ↔ capture ∈ (compile plan).captures := by
  change .captured capture ∈ (words plan).map (snapshotWord (requestedNames plan)) ↔
    capture ∈ (sourceNames plan).map (captureFor (requestedNames plan))
  constructor
  · intro member
    obtain ⟨word, wordMember, wordEq⟩ := List.mem_map.mp member
    cases word with
    | literal value => simp [snapshotWord] at wordEq
    | root => simp [snapshotWord] at wordEq
    | file path => simp [snapshotWord] at wordEq
    | environment name =>
        simp [snapshotWord] at wordEq
        have captureEq := wordEq
        have referenceMember : name ∈ (words plan).flatMap references :=
          List.mem_flatMap.mpr ⟨.environment name, wordMember, by simp [references]⟩
        have sourceMember : name ∈ sourceNames plan := (sourceNames_mem plan name).mpr referenceMember
        exact List.mem_map.mpr ⟨name, sourceMember, captureEq⟩
  · intro member
    obtain ⟨name, sourceMember, captureEq⟩ := List.mem_map.mp member
    obtain ⟨word, wordMember, referenceMember⟩ :=
      List.mem_flatMap.mp ((sourceNames_mem plan name).mp sourceMember)
    cases word with
    | literal value => simp [references] at referenceMember
    | root => simp [references] at referenceMember
    | file path => simp [references] at referenceMember
    | environment other =>
        simp [references] at referenceMember
        have otherEq : other = name := referenceMember.symm
        clear referenceMember
        subst other
        exact List.mem_map.mpr ⟨.environment name, wordMember,
          congrArg SnapshotWord.captured captureEq⟩

private theorem completeCapture (name : EnvironmentName)
    (ambient : EnvironmentName → String) :
    model.capture name
      (rawValue (fun source => some (ambient source)) name)
      (checkValue (fun source => some (ambient source)) name) =
      some (ambient name) := by
  simp [model, readCapture, rawValue, checkValue]

private theorem snapshotMapM (plan : Plan) (root : String) (ambient : EnvironmentName → String) :
    ((words plan).map (snapshotWord (requestedNames plan))).mapM
      (SnapshotWord.resolve model root (fun name => some (ambient name))) =
      some ((words plan).map (Word.resolve root ambient)) := by
  rw [List.mapM_map]
  induction words plan with
  | nil => simp
  | cons word rest ih =>
      cases word <;>
        simp [snapshotWord, SnapshotWord.resolve, Word.resolve, AtRoot, captureFor,
          completeCapture, ih]

private theorem append_index {α : Type} (base values suffix : List α) (start index : Nat)
    (baseLength : base.length = start) (indexValid : index < values.length) :
    (base ++ (values ++ suffix))[start + index]? = values[index]? := by
  have baseBound : base.length ≤ start + index := by omega
  rw [List.getElem?_append_right baseBound]
  have offset : start + index - base.length = index := by omega
  rw [offset]
  exact List.getElem?_append_left indexValid

private theorem slotsMapM {α : Type} (items : List α) (start : Nat)
    (base suffix : List String) (resolve : α → String)
    (baseLength : base.length = start) :
    (slots start items).mapM
      (fun index => (base ++ (items.map resolve ++ suffix))[index]?) =
      some (items.map resolve) := by
  induction items generalizing start base with
  | nil => simp [slots]
  | cons head tail ih =>
      simp only [slots]
      rw [List.mapM_cons]
      have headResult :
          (base ++ ((head :: tail).map resolve ++ suffix))[start]? = some (resolve head) := by
        simpa using append_index base ((head :: tail).map resolve) suffix start 0
          baseLength (by simp)
      have nextBaseLength : (base ++ [resolve head]).length = start + 1 := by
        simp [baseLength]
      have paramsEqual :
          base ++ ((head :: tail).map resolve ++ suffix) =
            (base ++ [resolve head]) ++ (tail.map resolve ++ suffix) := by
        simp [List.append_assoc]
      rw [headResult]
      rw [paramsEqual]
      rw [ih (start + 1) (base ++ [resolve head]) nextBaseLength]
      simp

private theorem exportsMapM (items : List (EnvironmentName × Word)) (start : Nat)
    (base suffix : List String) (resolve : Word → String)
    (baseLength : base.length = start) :
    (exports start items).mapM (fun binding => do
      return (binding.1, ← (base ++
        (items.map (fun entry => resolve entry.2) ++ suffix))[binding.2]?)) =
      some (items.map (fun binding => (binding.1, resolve binding.2))) := by
  induction items generalizing start base with
  | nil => simp [exports]
  | cons binding rest ih =>
      simp only [exports]
      rw [List.mapM_cons]
      have headResult :
          (base ++ ((binding :: rest).map (fun entry => resolve entry.2) ++ suffix))[start]? =
            some (resolve binding.2) := by
        simpa using append_index base ((binding :: rest).map (fun entry => resolve entry.2))
          suffix start 0 baseLength (by simp)
      have nextBaseLength : (base ++ [resolve binding.2]).length = start + 1 := by
        simp [baseLength]
      have paramsEqual :
          base ++ ((binding :: rest).map (fun entry => resolve entry.2) ++ suffix) =
            (base ++ [resolve binding.2]) ++
              (rest.map (fun entry => resolve entry.2) ++ suffix) := by
        simp [List.append_assoc]
      rw [headResult]
      rw [paramsEqual]
      rw [ih (start + 1) (base ++ [resolve binding.2]) nextBaseLength]
      simp

private theorem resolvedParameters (plan : Plan) (root : String)
    (ambient : EnvironmentName → String) :
    root :: ((words plan).map (Word.resolve root ambient)) =
      [root, Word.resolve root ambient plan.command, Word.resolve root ambient plan.cwd] ++
        (plan.args.map (Word.resolve root ambient)) ++
        (plan.environment.map (fun binding => Word.resolve root ambient binding.2)) := by
  simp [words, List.map_append]

private theorem execute_success (model : Interface) (script : Script) (root : String)
    (ambient : EnvironmentName → Option String) (snapshot : List String)
    (command : String) (args : List String) (environment : List (EnvironmentName × String))
    (cwd : String)
    (capturesPresent : script.captures.any (fun capture =>
      (model.capture capture.source (rawValue ambient capture.source)
        (checkValue ambient capture.source)).isNone) = false)
    (snapshotResolved : script.snapshot.mapM (SnapshotWord.resolve model root ambient) = some snapshot)
    (commandResolved : (root :: snapshot)[script.command]? = some command)
    (argsResolved : script.args.mapM (fun index => (root :: snapshot)[index]?) = some args)
    (environmentResolved : script.environment.mapM (fun binding => do
      return (binding.1, ← (root :: snapshot)[binding.2]?)) = some environment)
    (cwdResolved : (root :: snapshot)[script.cwd]? = some cwd) :
    execute model script root ambient = some ⟨command, args, environment, cwd⟩ := by
  simp only [bind, pure] at environmentResolved
  simp [execute, capturesPresent, snapshotResolved, commandResolved, argsResolved,
    environmentResolved, cwdResolved]

theorem L3_capture_coverage_distinct : L3_capture_coverage_distinct model := by
  intro plan
  refine ⟨?_, ?_, ?_⟩
  · intro name
    constructor
    · intro member
      have sourceMember : name ∈ sourceNames plan := (sourceNames_mem plan name).mpr member
      exact ⟨captureFor (requestedNames plan) name,
        List.mem_map.mpr ⟨name, sourceMember, rfl⟩, rfl⟩
    · rintro ⟨capture, captureMember, sourceEq⟩
      obtain ⟨source, sourceMember, captureEq⟩ := List.mem_map.mp captureMember
      subst capture
      change source = name at sourceEq
      subst source
      exact (sourceNames_mem plan name).mp sourceMember
  · change ((compile plan).captures.flatMap (fun capture => [capture.raw, capture.check])).Nodup
    rw [captureNames_eq]
    exact freshPairs_nodup (requestedNames plan) (sourceNames plan) (sourceNames_nodup plan)
  · exact captured_snapshot_mem plan

theorem L2_names_valid_fresh : L2_names_valid_fresh model := by
  intro plan capture member
  change capture ∈ (sourceNames plan).map (captureFor (requestedNames plan)) at member
  obtain ⟨source, _sourceMember, captureEq⟩ := List.mem_map.mp member
  subst capture
  refine ⟨freshName_valid (requestedNames plan) .raw source,
    freshName_valid (requestedNames plan) .check source, ?_⟩
  intro name nameMember
  exact ⟨freshName_ne_requested (requestedNames plan) .raw source name nameMember,
    freshName_ne_requested (requestedNames plan) .check source name nameMember⟩

theorem L4_complete_process_preserved : L4_complete_process_preserved model := by
  intro plan root ambient
  change execute model (compile plan) root (fun name => some (ambient name)) =
    some (expected plan root ambient)
  let complete := fun name => some (ambient name)
  let snapshot := (words plan).map (Word.resolve root ambient)
  let base := [root, Word.resolve root ambient plan.command, Word.resolve root ambient plan.cwd]
  let argsValues := plan.args.map (Word.resolve root ambient)
  let envValues := plan.environment.map (fun binding => Word.resolve root ambient binding.2)
  have paramsForm : root :: snapshot = base ++ (argsValues ++ envValues) := by
    simpa [snapshot, base, argsValues, envValues, List.append_assoc] using
      resolvedParameters plan root ambient
  have baseLength : base.length = 3 := by simp [base]
  have envBaseLength : (base ++ argsValues).length = 3 + plan.args.length := by
    simp [base, argsValues]
    omega
  have capturesPresent : (compile plan).captures.any (fun capture =>
      (model.capture capture.source (rawValue complete capture.source)
        (checkValue complete capture.source)).isNone) = false := by
    simp [model, readCapture, rawValue, checkValue, complete]
  have snapshotResolved : (compile plan).snapshot.mapM
      (SnapshotWord.resolve model root complete) = some snapshot := by
    change ((words plan).map (snapshotWord (requestedNames plan))).mapM
      (SnapshotWord.resolve model root complete) = some snapshot
    exact snapshotMapM plan root ambient
  have commandResolved : (root :: snapshot)[1]? =
      some (Word.resolve root ambient plan.command) := by
    rw [paramsForm]
    simp [base]
  have cwdResolved : (root :: snapshot)[2]? =
      some (Word.resolve root ambient plan.cwd) := by
    rw [paramsForm]
    simp [base]
  have argsResolved : (compile plan).args.mapM
      (fun index => (root :: snapshot)[index]?) = some argsValues := by
    change (slots 3 plan.args).mapM
      (fun index => (root :: snapshot)[index]?) = some argsValues
    rw [paramsForm]
    exact slotsMapM plan.args 3 base envValues (Word.resolve root ambient) baseLength
  have environmentResolved : (compile plan).environment.mapM (fun binding => do
      return (binding.1, ← (root :: snapshot)[binding.2]?)) =
      some (plan.environment.map (fun binding =>
        (binding.1, Word.resolve root ambient binding.2))) := by
    change (exports (3 + plan.args.length) plan.environment).mapM (fun binding => do
      return (binding.1, ← (root :: snapshot)[binding.2]?)) =
      some (plan.environment.map (fun binding =>
        (binding.1, Word.resolve root ambient binding.2)))
    rw [paramsForm]
    have envParamsEqual : base ++ (argsValues ++ envValues) =
        (base ++ argsValues) ++ (envValues ++ []) := by
      simp [List.append_assoc]
    rw [envParamsEqual]
    simpa [List.append_nil] using exportsMapM plan.environment
      (3 + plan.args.length) (base ++ argsValues) []
      (fun word => Word.resolve root ambient word) envBaseLength
  have result := execute_success model (compile plan) root complete snapshot
    (Word.resolve root ambient plan.command) argsValues
    (plan.environment.map (fun binding =>
      (binding.1, Word.resolve root ambient binding.2)))
    (Word.resolve root ambient plan.cwd) capturesPresent snapshotResolved commandResolved
    argsResolved environmentResolved cwdResolved
  simpa [expected, argsValues, envValues, complete] using result

theorem L5_missing_source_stops : L5_missing_source_stops model := by
  intro plan root ambient name member missing
  obtain ⟨capture, captureMember, sourceEq⟩ :=
    (L3_capture_coverage_distinct plan).1 name |>.mp member
  have missingSource : ambient capture.source = none := by
    simpa [sourceEq] using missing
  have captureFails : model.capture capture.source
      (rawValue ambient capture.source) (checkValue ambient capture.source) = none := by
    simp [model, readCapture, rawValue, checkValue, missingSource, fallback_ne_placeholder]
  have present : (compile plan).captures.any (fun candidate =>
      (model.capture candidate.source (rawValue ambient candidate.source)
        (checkValue ambient candidate.source)).isNone) = true := by
    apply List.any_eq_true.mpr
    exact ⟨capture, captureMember, by simp [captureFails]⟩
  change execute model (compile plan) root ambient = none
  unfold execute
  rw [present]
  rfl

theorem L6_native_shape_exact : L6_native_shape_exact model := by
  constructor
  · intro host path script
    cases host <;> simp [model, Launcher.native]
  · intro host path script nativeValue result
    cases host with
    | claudeCode =>
        have nativeEq :
            ({ command := rootVariable .claudeCode ++ "/" ++ path.value,
               args := [rootVariable .claudeCode], environment := nativeBindings script,
               cwd := none } : Native) = nativeValue := by
          simpa [model, Launcher.native] using result
        cases nativeEq
        simp [rootVariable, nativeBindings]
    | codex =>
        by_cases empty : script.captures = []
        · have nativeEq :
              ({ command := "./" ++ path.value, args := [rootVariable .codex],
                 environment := nativeBindings script, cwd := some (rootVariable .codex) } : Native) =
                nativeValue := by
            simpa [model, Launcher.native, empty] using result
          cases nativeEq
          simp [rootVariable, nativeBindings]
        · simp [model, Launcher.native, empty] at result

theorem L1_capture_exact : L1_capture_exact model := by
  intro name ambient
  cases present : ambient name with
  | none =>
      simp [model, readCapture, rawValue, checkValue, present, fallback_ne_placeholder]
  | some value =>
      simp [model, readCapture, rawValue, checkValue, present]

end PluginSdk.Compiler.Process.Launcher.Proofs
