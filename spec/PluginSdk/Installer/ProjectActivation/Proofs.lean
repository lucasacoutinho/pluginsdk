import PluginSdk.Installer.ProjectActivation.Model
import PluginSdk.Installer.ProjectActivation.Properties

namespace PluginSdk.Installer.ProjectActivation

open PluginSdk.Compiler

private theorem agentName_ext {left right : AgentName} (equal : left.value = right.value) :
    left = right := by
  cases left
  cases right
  simp_all

private theorem nameKey_injective {left right : AgentName}
    (equal : NameKey left = NameKey right) : left = right := by
  apply agentName_ext
  have values : [left.value] = [right.value] := by
    simpa [NameKey] using equal
  exact List.singleton_inj.mp values

private theorem mem_agents_iff_count_pos (agents : List AgentName) (agent : AgentName) :
    agent ∈ agents ↔ 0 < agents.countP (fun other => other == agent) := by
  simp only [List.countP_pos_iff]
  constructor
  · intro member
    exact ⟨agent, member, by simp⟩
  · rintro ⟨other, member, equal⟩
    have same : other = agent := by simpa using equal
    exact same ▸ member

@[simp] private theorem mem_duplicateAgents (input : BuildInput) (agent : AgentName) :
    agent ∈ duplicateAgents input ↔ Repeated input agent := by
  simp only [duplicateAgents, mem_ordered, mem_unique, List.mem_filter,
    decide_eq_true_eq]
  rw [mem_agents_iff_count_pos]
  unfold Repeated
  omega

private theorem count_eq_countP (agents : List AgentName) (agent : AgentName) :
    agents.count agent = agents.countP (fun other => other == agent) := by
  simp [List.count_eq_countP]

private theorem nodup_of_no_repeated (input : BuildInput)
    (none : ∀ agent, ¬ Repeated input agent) : input.agents.Nodup := by
  apply List.nodup_iff_count.mpr
  intro agent
  rw [count_eq_countP]
  have notRepeated := none agent
  unfold Repeated at notRepeated
  omega

private theorem no_repeated_of_nodup (input : BuildInput)
    (nodup : input.agents.Nodup) : ∀ agent, ¬ Repeated input agent := by
  intro agent repeated
  have atMost := (List.nodup_iff_count.mp nodup) agent
  rw [count_eq_countP] at atMost
  unfold Repeated at repeated
  omega

private theorem duplicateAgents_nil_of_nodup (input : BuildInput)
    (nodup : input.agents.Nodup) : duplicateAgents input = [] := by
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro agent member
  exact no_repeated_of_nodup input nodup agent ((mem_duplicateAgents input agent).mp member)

private theorem nodup_of_duplicateAgents_nil (input : BuildInput)
    (empty : duplicateAgents input = []) : input.agents.Nodup := by
  apply nodup_of_no_repeated input
  intro agent repeated
  have member : agent ∈ duplicateAgents input := (mem_duplicateAgents input agent).mpr repeated
  rw [empty] at member
  simp at member

private theorem duplicateAgents_perm {left right : BuildInput}
    (permutation : left.agents.Perm right.agents) :
    duplicateAgents left = duplicateAgents right := by
  unfold duplicateAgents
  apply ordered_unique_eq NameKey
  · intro agent
    simp only [List.mem_filter, decide_eq_true_eq]
    have counts := permutation.countP_eq (fun other => other == agent)
    constructor
    · rintro ⟨member, repeated⟩
      refine ⟨permutation.mem_iff.mp member, ?_⟩
      simpa [Repeated, counts] using repeated
    · rintro ⟨member, repeated⟩
      refine ⟨permutation.mem_iff.mpr member, ?_⟩
      simpa [Repeated, counts] using repeated
  · intro first second equal
    exact nameKey_injective equal

private theorem key_before_singleton {left right : String}
    (ordered : KeyBefore [left] [right]) : Utf8Before left right := by
  cases ordered with
  | rel value => exact value
  | cons tail => cases tail

private theorem duplicateAgents_nodup (input : BuildInput) :
    (duplicateAgents input).Nodup := by
  unfold duplicateAgents
  exact (ordered_perm NameKey (unique
    (input.agents.filter fun agent => decide (Repeated input agent)))).nodup_iff.mpr
      (unique_nodup _)

private theorem duplicateAgents_ordered (input : BuildInput) :
    (duplicateAgents input).Pairwise
      (fun left right => Utf8Before left.value right.value) := by
  unfold duplicateAgents
  let candidates := input.agents.filter fun agent => decide (Repeated input agent)
  have uniqueNodup := unique_nodup candidates
  have distinct : (unique candidates).Pairwise (fun left right => NameKey left ≠ NameKey right) := by
    exact uniqueNodup.imp (by
      intro left right different equal
      apply different
      apply agentName_ext
      have values : [left.value] = [right.value] := by
        simpa [NameKey] using equal
      exact List.singleton_inj.mp values)
  have sorted := ordered_strict NameKey (unique candidates) distinct
  exact sorted.imp (fun {left right} ordered => key_before_singleton ordered)

private theorem rejected_duplicates (input : BuildInput) (duplicates : NonemptyList AgentName)
    (rejected : build input = .rejected duplicates) :
    duplicates.toList = duplicateAgents input := by
  unfold build at rejected
  cases values : duplicateAgents input with
  | nil => simp [values] at rejected
  | cons head tail =>
      simp only [values] at rejected
      cases duplicates with
      | mk first rest =>
          injection rejected with equal
          cases equal
          rfl

private theorem rendered_build_parts (input : BuildInput) (cache : Cache)
    (activation : Activation)
    (rendered : build input = .rendered cache activation) :
    duplicateAgents input = [] ∧ cache = nativeCache input ∧
      activation = ⟨input.registration,
        (ordered NameKey input.agents).map (nativeBinding input (nativeCache input))⟩ := by
  unfold build at rendered
  cases duplicates : duplicateAgents input with
  | nil =>
      simp only [duplicates] at rendered
      injection rendered with cacheEqual activationEqual
      exact ⟨rfl, cacheEqual.symm, activationEqual.symm⟩
  | cons head tail => simp [duplicates] at rendered

private theorem binding_matches_iff (input : BuildInput) (cache : Cache)
    (agent : AgentName) (binding : Binding) :
    BindingMatches input cache agent binding ↔ binding = nativeBinding input cache agent := by
  cases binding
  simp [BindingMatches, nativeBinding]

private theorem nativeBinding_name_injective (input : BuildInput) (cache : Cache)
    {left right : AgentName}
    (equal : (nativeBinding input cache left).name = (nativeBinding input cache right).name) :
    left = right := by
  have chars := congrArg String.toList equal
  have normalized : input.registration.plugin.toList ++ ":".toList ++ left.value.toList =
      input.registration.plugin.toList ++ ":".toList ++ right.value.toList := by
    simpa [nativeBinding, String.toList_append, List.append_assoc] using chars
  have values := List.append_cancel_left normalized
  exact agentName_ext (String.toList_inj.mp values)

private theorem agent_file_suffix_injective (leading separator : String) {left right : AgentName}
    (equal : leading ++ "agents" ++ separator ++ (left.value ++ ".toml") =
      leading ++ "agents" ++ separator ++ (right.value ++ ".toml")) : left = right := by
  have chars := congrArg String.toList equal
  have normalized : leading.toList ++
      ("agents".toList ++ (separator.toList ++ (left.value.toList ++ ".toml".toList))) =
      leading.toList ++
        ("agents".toList ++ (separator.toList ++ (right.value.toList ++ ".toml".toList))) := by
    simpa [String.toList_append, List.append_assoc] using chars
  have afterPrefix := List.append_cancel_left (as := leading.toList) normalized
  have afterAgents := List.append_cancel_left (as := "agents".toList) afterPrefix
  have afterSeparator := List.append_cancel_left (as := separator.toList) afterAgents
  have values := List.append_cancel_right afterSeparator
  exact agentName_ext (String.toList_inj.mp values)

private theorem nativeBinding_path_injective (input : BuildInput) (cache : Cache)
    {left right : AgentName}
    (equal : (nativeBinding input cache left).configFile =
      (nativeBinding input cache right).configFile) : left = right := by
  let basePathPrefix :=
    String.ofList ((cache.payload.toList.reverse.dropWhile
      (fun character => character == SeparatorChar input.platform)).reverse) ++
      Separator input.platform
  apply agent_file_suffix_injective basePathPrefix (Separator input.platform)
  simpa [nativeBinding, NativePath, basePathPrefix, String.intercalate_cons_cons,
    String.append_assoc] using equal

private theorem perm_nil_iff {α : Type} {left right : List α}
    (permutation : left.Perm right) : left = [] ↔ right = [] := by
  constructor
  · intro leftNil
    subst left
    cases right with
    | nil => rfl
    | cons head tail =>
        have lengths := permutation.length_eq
        simp at lengths
  · intro rightNil
    subst right
    cases left with
    | nil => rfl
    | cons head tail =>
        have lengths := permutation.length_eq
        simp at lengths

private theorem map_nodup_of_injective {α β : Type} {values : List α} (function : α → β)
    (nodup : values.Nodup) (injective : ∀ left right, function left = function right → left = right) :
    (values.map function).Nodup := by
  apply List.nodup_iff_pairwise_ne.mpr
  exact List.Pairwise.map function (by
    intro left right different equal
    exact different (injective left right equal)) (List.nodup_iff_pairwise_ne.mp nodup)

private theorem mem_nativeBindings_iff (input : BuildInput) (cache : Cache) (binding : Binding) :
    binding ∈ (ordered NameKey input.agents).map (nativeBinding input cache) ↔
      ∃ agent ∈ input.agents, BindingMatches input cache agent binding := by
  constructor
  · intro member
    obtain ⟨agent, orderedMember, equal⟩ := List.mem_map.mp member
    have inputMember : agent ∈ input.agents := (ordered_perm NameKey input.agents).mem_iff.mp orderedMember
    refine ⟨agent, inputMember, ?_⟩
    exact (binding_matches_iff input cache agent binding).mpr equal.symm
  · rintro ⟨agent, inputMember, matchFact⟩
    have orderedMember : agent ∈ ordered NameKey input.agents :=
      (ordered_perm NameKey input.agents).mem_iff.mpr inputMember
    apply List.mem_map.mpr
    exact ⟨agent, orderedMember,
      (binding_matches_iff input cache agent binding).mp matchFact |>.symm⟩

private theorem review_ready_iff_safe (input : AuthorityInput) :
    review input = .ready ↔ Safe input := by
  by_cases roles : HasRoles input
  · by_cases basis : UniqueBasis input
    · by_cases known : Known input
      · by_cases noConflict : NoForeignConflict input
        · by_cases owned : OwnedExact input
          · simp [review, Safe, roles, basis, known, noConflict, owned]
          · simp [review, Safe, roles, basis, known, noConflict, owned]
        · simp [review, Safe, roles, basis, known, noConflict]
      · simp [review, Safe, roles, basis, known]
    · simp [review, Safe, roles, basis]
  · simp [review, Safe, roles]

private theorem hasRoles_perm {left right : AuthorityInput}
    (previous : left.previous.Perm right.previous) (desired : left.desired.Perm right.desired) :
    HasRoles left ↔ HasRoles right := by
  unfold HasRoles
  have previous_ne_nil : left.previous ≠ [] ↔ right.previous ≠ [] := by
    constructor
    · intro leftNonempty rightNil
      exact leftNonempty ((perm_nil_iff previous).mpr rightNil)
    · intro rightNonempty leftNil
      exact rightNonempty ((perm_nil_iff previous).mp leftNil)
  have desired_ne_nil : left.desired ≠ [] ↔ right.desired ≠ [] := by
    constructor
    · intro leftNonempty rightNil
      exact leftNonempty ((perm_nil_iff desired).mpr rightNil)
    · intro rightNonempty leftNil
      exact rightNonempty ((perm_nil_iff desired).mp leftNil)
  constructor
  · rintro (previousNonempty | desiredNonempty)
    · exact Or.inl (previous_ne_nil.mp previousNonempty)
    · exact Or.inr (desired_ne_nil.mp desiredNonempty)
  · rintro (previousNonempty | desiredNonempty)
    · exact Or.inl (previous_ne_nil.mpr previousNonempty)
    · exact Or.inr (desired_ne_nil.mpr desiredNonempty)

private theorem uniqueBindings_perm {left right : List Binding}
    (permutation : left.Perm right) : UniqueBindings left ↔ UniqueBindings right := by
  unfold UniqueBindings
  constructor
  · rintro ⟨names, paths⟩
    exact ⟨(permutation.map Binding.name).nodup_iff.mp names,
      (permutation.map Binding.configFile).nodup_iff.mp paths⟩
  · rintro ⟨names, paths⟩
    exact ⟨(permutation.symm.map Binding.name).nodup_iff.mp names,
      (permutation.symm.map Binding.configFile).nodup_iff.mp paths⟩

private theorem uniqueBasis_perm {left right : AuthorityInput}
    (previous : left.previous.Perm right.previous) (desired : left.desired.Perm right.desired) :
    UniqueBasis left ↔ UniqueBasis right := by
  unfold UniqueBasis
  exact ⟨fun facts => ⟨(uniqueBindings_perm previous).mp facts.1,
    (uniqueBindings_perm desired).mp facts.2⟩,
    fun facts => ⟨(uniqueBindings_perm previous).mpr facts.1,
      (uniqueBindings_perm desired).mpr facts.2⟩⟩

private theorem relevantName_perm (left right : AuthorityInput) (name : String)
    (previous : left.previous.Perm right.previous) (desired : left.desired.Perm right.desired) :
    RelevantName left name ↔ RelevantName right name := by
  have permutation : (left.previous ++ left.desired).map Binding.name |>.Perm
      ((right.previous ++ right.desired).map Binding.name) :=
    (previous.append desired).map Binding.name
  exact permutation.mem_iff

private theorem relevantPath_perm (left right : AuthorityInput) (path : String)
    (previous : left.previous.Perm right.previous) (desired : left.desired.Perm right.desired) :
    RelevantPath left path ↔ RelevantPath right path := by
  have permutation : (left.previous ++ left.desired).map Binding.configFile |>.Perm
      ((right.previous ++ right.desired).map Binding.configFile) :=
    (previous.append desired).map Binding.configFile
  exact permutation.mem_iff

private theorem foreignConflict_perm (left right : AuthorityInput) (observation : Observation)
    (previous : left.previous.Perm right.previous) (desired : left.desired.Perm right.desired) :
    ForeignConflict left observation ↔ ForeignConflict right observation := by
  cases observation with
  | declared source declaredName name file =>
      cases source with
      | managed => simp [ForeignConflict]
      | foreign =>
          cases file with
          | none => simp [ForeignConflict, relevantName_perm left right declaredName previous desired,
              relevantName_perm left right name previous desired]
          | some path => simp [ForeignConflict,
              relevantName_perm left right declaredName previous desired,
              relevantName_perm left right name previous desired,
              relevantPath_perm left right path previous desired]
  | discovered name path =>
      simp [ForeignConflict, relevantName_perm left right name previous desired,
        relevantPath_perm left right path previous desired]
  | unknown => simp [ForeignConflict]

private theorem known_perm {left right : AuthorityInput}
    (observed : left.observed.Perm right.observed) : Known left ↔ Known right := by
  unfold Known
  constructor
  · intro leftKnown member
    exact leftKnown (observed.mem_iff.mpr member)
  · intro rightKnown member
    exact rightKnown (observed.mem_iff.mp member)

private theorem noForeignConflict_perm {left right : AuthorityInput}
    (previous : left.previous.Perm right.previous) (desired : left.desired.Perm right.desired)
    (observed : left.observed.Perm right.observed) :
    NoForeignConflict left ↔ NoForeignConflict right := by
  unfold NoForeignConflict
  constructor
  · intro safe observation member conflict
    have leftMember := observed.mem_iff.mpr member
    have leftConflict := (foreignConflict_perm left right observation previous desired).mpr conflict
    exact safe observation leftMember leftConflict
  · intro safe observation member conflict
    have rightMember := observed.mem_iff.mp member
    have rightConflict := (foreignConflict_perm left right observation previous desired).mp conflict
    exact safe observation rightMember rightConflict

private theorem ownedAllowed_perm (left right : AuthorityInput) (observation : Observation)
    (previous : left.previous.Perm right.previous) :
    OwnedAllowed left observation ↔ OwnedAllowed right observation := by
  cases observation with
  | declared source declaredName name file =>
      cases source with
      | managed =>
          unfold OwnedAllowed
          constructor
          · rintro ⟨binding, member, equal⟩
            exact ⟨binding, previous.mem_iff.mp member, equal⟩
          · rintro ⟨binding, member, equal⟩
            exact ⟨binding, previous.mem_iff.mpr member, equal⟩
      | foreign => simp [OwnedAllowed]
  | discovered name path => simp [OwnedAllowed]
  | unknown => simp [OwnedAllowed]

private theorem ownedExact_perm {left right : AuthorityInput}
    (previous : left.previous.Perm right.previous) (observed : left.observed.Perm right.observed) :
    OwnedExact left ↔ OwnedExact right := by
  unfold OwnedExact
  constructor
  · rintro ⟨exact, allowed⟩
    refine ⟨?_, ?_⟩
    · intro binding member
      have count := exact binding (previous.mem_iff.mpr member)
      rw [← observed.count_eq (OwnedObservation binding)]
      exact count
    · intro observation member
      exact (ownedAllowed_perm left right observation previous).mp
        (allowed observation (observed.mem_iff.mpr member))
  · rintro ⟨exact, allowed⟩
    refine ⟨?_, ?_⟩
    · intro binding member
      have count := exact binding (previous.mem_iff.mp member)
      rw [← observed.symm.count_eq (OwnedObservation binding)]
      exact count
    · intro observation member
      exact (ownedAllowed_perm left right observation previous).mpr
        (allowed observation (observed.mem_iff.mp member))

namespace Proofs

theorem PA1_build_admission_exact :
    PluginSdk.Installer.ProjectActivation.PA1_build_admission_exact model := by
  intro input
  constructor
  · intro nodup
    have duplicatesEmpty := duplicateAgents_nil_of_nodup input nodup
    refine ⟨nativeCache input, ⟨input.registration,
      (ordered NameKey input.agents).map (nativeBinding input (nativeCache input))⟩, ?_⟩
    change build input = .rendered _ _
    simp [build, duplicatesEmpty]
  · rintro ⟨cache, activation, rendered⟩
    have parts := rendered_build_parts input cache activation rendered
    exact nodup_of_duplicateAgents_nil input parts.1

theorem PA2_duplicate_diagnostics_exact :
    PluginSdk.Installer.ProjectActivation.PA2_duplicate_diagnostics_exact model := by
  constructor
  · intro input agent
    constructor
    · intro repeated
      have member : agent ∈ duplicateAgents input := (mem_duplicateAgents input agent).mpr repeated
      cases values : duplicateAgents input with
      | nil => simp [values] at member
      | cons head tail =>
          refine ⟨⟨head, tail⟩, ?_, ?_⟩
          · change build input = .rejected ⟨head, tail⟩
            unfold build
            rw [values]
            rfl
          · change agent ∈ head :: tail
            simpa [values] using member
    · rintro ⟨duplicates, rejected, member⟩
      have listEqual := rejected_duplicates input duplicates rejected
      rw [listEqual] at member
      exact (mem_duplicateAgents input agent).mp member
  · intro input duplicates rejected
    have listEqual := rejected_duplicates input duplicates rejected
    rw [listEqual]
    refine ⟨duplicateAgents_nodup input, ?_⟩
    exact List.Pairwise.map (fun agent : AgentName => agent.value)
      (fun _ _ ordered => ordered)
      (duplicateAgents_ordered input)

theorem PA3_cache_paths_exact :
    PluginSdk.Installer.ProjectActivation.PA3_cache_paths_exact model := by
  intro input cache activation rendered
  have cacheEqual := (rendered_build_parts input cache activation rendered).2.1
  rw [cacheEqual]
  simp [CacheMatches, nativeCache]

theorem PA4_agent_bindings_exact :
    PluginSdk.Installer.ProjectActivation.PA4_agent_bindings_exact model := by
  intro input cache activation rendered
  rcases rendered_build_parts input cache activation rendered with ⟨_, cacheEqual, activationEqual⟩
  rw [activationEqual]
  rw [cacheEqual]
  have inputNodup : input.agents.Nodup := nodup_of_duplicateAgents_nil input
    (rendered_build_parts input cache activation rendered).1
  have orderedNodup : (ordered NameKey input.agents).Nodup :=
    (ordered_perm NameKey input.agents).nodup_iff.mpr inputNodup
  have namesNodup := map_nodup_of_injective
    (fun agent => (nativeBinding input (nativeCache input) agent).name)
    orderedNodup (by
      intro left right equal
      exact nativeBinding_name_injective input (nativeCache input) equal)
  have pathsNodup := map_nodup_of_injective
    (fun agent => (nativeBinding input (nativeCache input) agent).configFile)
    orderedNodup (by
      intro left right equal
      exact nativeBinding_path_injective input (nativeCache input) equal)
  constructor
  · constructor
    · change (((ordered NameKey input.agents).map
        (nativeBinding input (nativeCache input))).map Binding.name).Nodup
      simpa only [List.map_map, Function.comp_def] using namesNodup
    · change (((ordered NameKey input.agents).map
        (nativeBinding input (nativeCache input))).map Binding.configFile).Nodup
      simpa only [List.map_map, Function.comp_def] using pathsNodup
  · intro binding
    exact mem_nativeBindings_iff input (nativeCache input) binding

theorem PA5_registration_preserved :
    PluginSdk.Installer.ProjectActivation.PA5_registration_preserved model := by
  intro input cache activation rendered
  exact congrArg Activation.registration
    (rendered_build_parts input cache activation rendered).2.2

theorem PA6_build_enumeration_invariant :
    PluginSdk.Installer.ProjectActivation.PA6_build_enumeration_invariant model := by
  intro left right platformEqual homeEqual versionEqual registrationEqual agentsPermutation
  have duplicatesEqual := duplicateAgents_perm agentsPermutation
  have agentsEqual := ordered_eq_of_perm NameKey agentsPermutation (by
    intro first _ second _ equal
    exact nameKey_injective equal)
  have cacheEqual : nativeCache left = nativeCache right := by
    simp [nativeCache, platformEqual, homeEqual, versionEqual, registrationEqual]
  have bindingsEqual : nativeBinding left (nativeCache right) =
      nativeBinding right (nativeCache right) := by
    funext agent
    simp [nativeBinding, platformEqual, registrationEqual]
  change build left = build right
  simp [build, duplicatesEqual, agentsEqual, cacheEqual, bindingsEqual, registrationEqual]

theorem PA7_basic_package_has_no_agents :
    PluginSdk.Installer.ProjectActivation.PA7_basic_package_has_no_agents model := by
  intro input empty
  cases input with
  | mk platform home version registration agents =>
      cases empty
      refine ⟨nativeCache ⟨platform, home, version, registration, []⟩, ?_⟩
      change build ⟨platform, home, version, registration, []⟩ =
        .rendered _ ⟨registration, []⟩
      have duplicatesEmpty : duplicateAgents
          ⟨platform, home, version, registration, []⟩ = [] := by
        simp [duplicateAgents, ordered, unique]
      have orderedEmpty : ordered NameKey ([] : List AgentName) = [] := by
        simp [ordered]
      simp [build, duplicatesEmpty, orderedEmpty, nativeCache]

theorem PA8_market_source_does_not_change_cache :
    PluginSdk.Installer.ProjectActivation.PA8_market_source_does_not_change_cache model := by
  intro input cache activation root rendered
  let updated : BuildInput :=
    { input with registration := { input.registration with root := root } }
  have parts := rendered_build_parts input cache activation rendered
  have updatedEmpty : duplicateAgents updated = [] := by
    change duplicateAgents input = []
    exact parts.1
  have updatedCache : nativeCache updated = cache := by
    rw [parts.2.1]
    simp [updated, nativeCache]
  have updatedActivation :
      { activation with registration := updated.registration } =
        ⟨updated.registration,
          (ordered NameKey updated.agents).map (nativeBinding updated (nativeCache updated))⟩ := by
    rw [parts.2.2]
    simp [updated, nativeBinding, nativeCache]
  change build updated = .rendered cache {activation with registration := updated.registration}
  have rebuilt : build updated = .rendered (nativeCache updated)
      ⟨updated.registration,
        (ordered NameKey updated.agents).map (nativeBinding updated (nativeCache updated))⟩ := by
    simp [build, updatedEmpty]
  calc
    build updated = .rendered (nativeCache updated)
        ⟨updated.registration,
          (ordered NameKey updated.agents).map (nativeBinding updated (nativeCache updated))⟩ := rebuilt
    _ = .rendered cache
        ⟨updated.registration,
          (ordered NameKey updated.agents).map (nativeBinding updated (nativeCache updated))⟩ :=
          congrArg (fun value => BuildResult.rendered value
            ⟨updated.registration,
              (ordered NameKey updated.agents).map (nativeBinding updated (nativeCache updated))⟩)
            updatedCache
    _ = .rendered cache {activation with registration := updated.registration} :=
          congrArg (BuildResult.rendered cache) updatedActivation.symm

theorem RA1_authority_admission_exact :
    PluginSdk.Installer.ProjectActivation.RA1_authority_admission_exact model := by
  intro input
  exact review_ready_iff_safe input

theorem RA2_authority_reason_exact :
    PluginSdk.Installer.ProjectActivation.RA2_authority_reason_exact model := by
  intro input reason
  cases reason <;>
    by_cases roles : HasRoles input <;>
    by_cases basis : UniqueBasis input <;>
    by_cases known : Known input <;>
    by_cases noConflict : NoForeignConflict input <;>
    by_cases owned : OwnedExact input <;>
    simp [model, review, RequiredReason, roles, basis, known, noConflict, owned]

theorem RA3_owned_declarations_exact :
    PluginSdk.Installer.ProjectActivation.RA3_owned_declarations_exact model := by
  intro input roles ready
  have safe := (review_ready_iff_safe input).mp ready
  rcases safe with noRoles | ⟨_, _, _, owned⟩
  · exact False.elim (noRoles roles)
  · exact owned

theorem RA4_foreign_collision_refused :
    PluginSdk.Installer.ProjectActivation.RA4_foreign_collision_refused model := by
  intro input observation roles basis known member conflict
  have noConflict : ¬ NoForeignConflict input := by
    intro safe
    exact safe observation member conflict
  simp [model, review, roles, basis, known, noConflict]

theorem RA5_basic_package_requires_no_role_scan :
    PluginSdk.Installer.ProjectActivation.RA5_basic_package_requires_no_role_scan model := by
  intro observed
  simp [model, review, HasRoles]

theorem RA6_authority_enumeration_invariant :
    PluginSdk.Installer.ProjectActivation.RA6_authority_enumeration_invariant model := by
  intro left right previousPermutation desiredPermutation observedPermutation
  have roles : HasRoles left ↔ HasRoles right :=
    hasRoles_perm previousPermutation desiredPermutation
  have basis : UniqueBasis left ↔ UniqueBasis right :=
    uniqueBasis_perm previousPermutation desiredPermutation
  have known : Known left ↔ Known right := known_perm observedPermutation
  have noConflict : NoForeignConflict left ↔ NoForeignConflict right :=
    noForeignConflict_perm previousPermutation desiredPermutation observedPermutation
  have exact : OwnedExact left ↔ OwnedExact right :=
    ownedExact_perm previousPermutation observedPermutation
  change review left = review right
  simp only [review, propext roles, propext basis, propext known,
    propext noConflict, propext exact]

end Proofs

end PluginSdk.Installer.ProjectActivation
