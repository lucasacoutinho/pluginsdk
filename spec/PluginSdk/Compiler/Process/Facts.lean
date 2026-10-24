import PluginSdk.Compiler.Process.Model

namespace PluginSdk.Compiler.Process

theorem packagePath_eq_of_value_eq {left right : PackagePath}
    (equal : left.value = right.value) : left = right := by
  cases left with
  | mk leftValue leftContained =>
    cases right with
    | mk rightValue rightContained =>
      cases equal
      have proofEqual : leftContained = rightContained := Subsingleton.elim _ _
      cases proofEqual
      rfl

theorem environmentName_eq_of_value_eq {left right : EnvironmentName}
    (equal : left.value = right.value) : left = right := by
  cases left with
  | mk leftValue leftValid =>
    cases right with
    | mk rightValue rightValid =>
      cases equal
      have proofEqual : leftValid = rightValid := Subsingleton.elim _ _
      cases proofEqual
      rfl

@[simp] theorem containsFile_eq_true (input : Input) (path : PackagePath) :
    containsFile input path = true ↔ FilePresent input path := by
  simp [containsFile, FilePresent]

@[simp] theorem containsDirectory_eq_true (input : Input) (path : PackagePath) :
    containsDirectory input path = true ↔ DirectoryPresent input path := by
  simp [containsDirectory, DirectoryPresent]

private theorem mem_fileArguments (arguments : List Argument) (path : PackagePath) :
    path ∈ arguments.filterMap (fun argument =>
      match argument with
      | .literal _ => none
      | .file path => some path) ↔ .file path ∈ arguments := by
  induction arguments with
  | nil => simp
  | cons argument rest ih =>
    cases argument <;> simp [ih]

@[simp] theorem mem_referencedFiles (definition : Definition) (path : PackagePath) :
    path ∈ referencedFiles definition ↔ RequiredFile definition path := by
  cases command : definition.command with
  | external name =>
    simp only [referencedFiles, command, List.nil_append, RequiredFile]
    constructor
    · intro fileMember
      exact Or.inr ((mem_fileArguments definition.args path).mp fileMember)
    · rintro (impossible | fileMember)
      · cases impossible
      · exact (mem_fileArguments definition.args path).mpr fileMember
  | file commandPath =>
    simp only [referencedFiles, command, List.mem_append, List.mem_singleton,
      RequiredFile, Program.file.injEq]
    constructor
    · rintro (pathEqual | argumentMember)
      · exact Or.inl pathEqual.symm
      · exact Or.inr ((mem_fileArguments definition.args path).mp argumentMember)
    · rintro (commandEqual | argumentMember)
      · exact Or.inl commandEqual.symm
      · exact Or.inr ((mem_fileArguments definition.args path).mpr argumentMember)

private theorem mem_missingPaths (input : Input) (path : PackagePath) :
    path ∈ missingPaths input ↔
      RequiredFile input.definition path ∧ ¬ FilePresent input path := by
  simp only [missingPaths, List.mem_filterMap]
  constructor
  · rintro ⟨candidate, candidateMember, result⟩
    by_cases present : containsFile input candidate = true
    · simp [present] at result
    · simp [present] at result
      have candidateEqual : candidate = path := result
      subst path
      exact ⟨(mem_referencedFiles input.definition candidate).mp candidateMember,
        fun captured => present ((containsFile_eq_true input candidate).mpr captured)⟩
  · rintro ⟨required, absent⟩
    have candidateMember : path ∈ referencedFiles input.definition :=
      (mem_referencedFiles input.definition path).mpr required
    have notPresent : containsFile input path ≠ true :=
      fun present => absent ((containsFile_eq_true input path).mp present)
    refine ⟨path, candidateMember, ?_⟩
    simp [notPresent]

private theorem mem_notExecutablePaths (input : Input) (path : PackagePath) :
    path ∈ notExecutablePaths input ↔ RequiredIssue input (.notExecutable path) := by
  cases command : input.definition.command with
  | external name => simp [notExecutablePaths, command, RequiredIssue]
  | file commandPath =>
    simp only [notExecutablePaths, command, List.mem_filterMap]
    constructor
    · rintro ⟨asset, member, result⟩
      by_cases isBad : asset.path = commandPath ∧ asset.file.executable = false
      · simp [isBad] at result
        have commandPathEqual : commandPath = path := result
        have requiredCommand : input.definition.command = Program.file path :=
          command.trans (congrArg Program.file commandPathEqual)
        have assetPathEqual := isBad.1.trans commandPathEqual
        exact ⟨requiredCommand, ⟨⟨asset, member, assetPathEqual⟩,
          ⟨asset, member, ⟨assetPathEqual, isBad.2⟩⟩⟩⟩
      · simp [isBad] at result
    · rintro ⟨requiredCommand, present, ⟨asset, member, ⟨assetPathEqual, notExecutable⟩⟩⟩
      have commandPathEqual := Program.file.inj (command.symm.trans requiredCommand)
      have assetCommandEqual := assetPathEqual.trans commandPathEqual.symm
      refine ⟨asset, member, ?_⟩
      simp [assetCommandEqual, commandPathEqual, notExecutable]

private theorem mem_missingDirectoryPaths (input : Input) (path : PackagePath) :
    path ∈ missingDirectoryPaths input ↔
      input.definition.cwd = some path ∧ ¬ DirectoryPresent input path := by
  cases cwd : input.definition.cwd with
  | none => simp [missingDirectoryPaths, cwd]
  | some cwdPath =>
    by_cases pathEqual : cwdPath = path
    · subst path
      simp [missingDirectoryPaths, cwd, containsDirectory_eq_true]
    · simp [missingDirectoryPaths, cwd, pathEqual]

private theorem mem_unsupportedEnvironmentNames (input : Input) (name : EnvironmentName) :
    name ∈ unsupportedEnvironmentNames input ↔
      input.host = Host.codex ∧ ReferencesEnvironment input.definition name := by
  cases host : input.host with
  | claudeCode => simp [unsupportedEnvironmentNames, host]
  | codex =>
    simp only [true_and]
    change name ∈ unsupportedEnvironmentNames input ↔
      ∃ binding, binding ∈ input.definition.environment ∧ binding.2 = .reference name
    simp only [unsupportedEnvironmentNames, host, List.mem_filterMap]
    constructor
    · rintro ⟨⟨bindingName, value⟩, member, result⟩
      cases value with
      | literal text => simp at result
      | reference referenceName =>
        simp at result
        subst referenceName
        exact ⟨(bindingName, .reference name), member, rfl⟩
    · rintro ⟨binding, member, valueEqual⟩
      rcases binding with ⟨bindingName, value⟩
      cases value with
      | literal text => simp at valueEqual
      | reference referenceName =>
        simp at valueEqual
        subst referenceName
        exact ⟨(bindingName, .reference name), member, rfl⟩

private theorem mem_collidingEnvironmentNames (input : Input) (name : EnvironmentName) :
    name ∈ collidingEnvironmentNames input ↔
      1 < (input.definition.environment.map Prod.fst).count name := by
  simp only [collidingEnvironmentNames, List.mem_filterMap]
  constructor
  · rintro ⟨candidate, member, result⟩
    by_cases collides : 1 < (input.definition.environment.map Prod.fst).count candidate
    · simp [collides] at result
      rw [← result]
      exact collides
    · simp [collides] at result
  · intro collides
    have nameMember : name ∈ input.definition.environment.map Prod.fst :=
      List.count_pos_iff.mp (by omega)
    exact ⟨name, nameMember, by simp [collides]⟩

theorem mem_rawIssues (input : Input) (issue : Issue) :
    issue ∈ rawIssues input ↔ RequiredIssue input issue := by
  cases issue with
  | missingFile path =>
    simp [rawIssues, missingFileIssues, notExecutableIssues, missingDirectoryIssues,
      unsupportedEnvironmentIssues, environmentCollisionIssues, mem_missingPaths,
      mem_notExecutablePaths, mem_missingDirectoryPaths, mem_unsupportedEnvironmentNames,
      mem_collidingEnvironmentNames, RequiredIssue]
  | notExecutable path =>
    simp [rawIssues, missingFileIssues, notExecutableIssues, missingDirectoryIssues,
      unsupportedEnvironmentIssues, environmentCollisionIssues, mem_missingPaths,
      mem_notExecutablePaths, mem_missingDirectoryPaths, mem_unsupportedEnvironmentNames,
      mem_collidingEnvironmentNames, RequiredIssue]
  | missingDirectory path =>
    simp [rawIssues, missingFileIssues, notExecutableIssues, missingDirectoryIssues,
      unsupportedEnvironmentIssues, environmentCollisionIssues, mem_missingPaths,
      mem_notExecutablePaths, mem_missingDirectoryPaths, mem_unsupportedEnvironmentNames,
      mem_collidingEnvironmentNames, RequiredIssue]
  | environmentReferenceUnsupported name =>
    simp [rawIssues, missingFileIssues, notExecutableIssues, missingDirectoryIssues,
      unsupportedEnvironmentIssues, environmentCollisionIssues, mem_missingPaths,
      mem_notExecutablePaths, mem_missingDirectoryPaths, mem_unsupportedEnvironmentNames,
      mem_collidingEnvironmentNames, RequiredIssue]
  | environmentCollision name =>
    simp [rawIssues, missingFileIssues, notExecutableIssues, missingDirectoryIssues,
      unsupportedEnvironmentIssues, environmentCollisionIssues, mem_missingPaths,
      mem_notExecutablePaths, mem_missingDirectoryPaths, mem_unsupportedEnvironmentNames,
      mem_collidingEnvironmentNames, RequiredIssue]

@[simp] theorem mem_issues (input : Input) (issue : Issue) :
    issue ∈ issues input ↔ RequiredIssue input issue := by
  change issue ∈ Compiler.ordered IssueKey (Compiler.unique (rawIssues input)) ↔ _
  simp only [Compiler.mem_ordered, Compiler.mem_unique, mem_rawIssues]

theorem issues_empty_iff_representable (input : Input) :
    issues input = [] ↔ Representable input := by
  constructor
  · intro absent
    refine ⟨?_, ?_, ?_, ?_, ?_⟩
    · intro path required
      by_cases present : FilePresent input path
      · exact present
      · have member := (mem_issues input (.missingFile path)).mpr ⟨required, present⟩
        simp [absent] at member
    · intro path command asset member pathEqual
      cases executable : asset.file.executable with
      | true => rfl
      | false =>
        have required : RequiredIssue input (.notExecutable path) := by
          refine ⟨command, ?_, ?_⟩
          · exact ⟨asset, member, pathEqual⟩
          · exact ⟨asset, ⟨member, ⟨pathEqual, executable⟩⟩⟩
        have diagnostic := (mem_issues input (.notExecutable path)).mpr required
        simp [absent] at diagnostic
    · intro path cwd
      by_cases present : DirectoryPresent input path
      · exact present
      · have diagnostic := (mem_issues input (.missingDirectory path)).mpr ⟨cwd, present⟩
        simp [absent] at diagnostic
    · apply List.nodup_iff_count.mpr
      intro name
      by_cases countLe : (input.definition.environment.map Prod.fst).count name ≤ 1
      · exact countLe
      · have count : 1 < (input.definition.environment.map Prod.fst).count name := by omega
        have diagnostic := (mem_issues input (.environmentCollision name)).mpr count
        simp [absent] at diagnostic
    · intro unsupported name reference
      have diagnostic := (mem_issues input (.environmentReferenceUnsupported name)).mpr
        ⟨unsupported, reference⟩
      simp [absent] at diagnostic
  · rintro ⟨filesPresent, executable, directoryPresent, namesUnique, referencesSupported⟩
    apply List.eq_nil_iff_forall_not_mem.mpr
    intro issue member
    have required := (mem_issues input issue).mp member
    cases issue with
    | missingFile path =>
      obtain ⟨required, absent⟩ := required
      exact absent (filesPresent path required)
    | notExecutable path =>
      obtain ⟨command, ⟨present, ⟨asset, ⟨assetMember, ⟨pathEqual, nonExecutable⟩⟩⟩⟩⟩ := required
      have impossible : false = true :=
        nonExecutable.symm.trans (executable path command asset assetMember pathEqual)
      cases impossible
    | missingDirectory path =>
      obtain ⟨cwd, absent⟩ := required
      exact absent (directoryPresent path cwd)
    | environmentReferenceUnsupported name =>
      exact referencesSupported required.1 name required.2
    | environmentCollision name =>
      have countLe := (List.nodup_iff_count.mp namesUnique) name
      simp only [RequiredIssue] at required
      omega

theorem planned_iff_issues_empty (input : Input) :
    (∃ plan, lower input = .planned plan) ↔ issues input = [] := by
  cases present : issues input <;> simp [lower, present]

theorem rejected_facts {input : Input} {output : NonemptyList Issue}
    (failure : model.lower input = .rejected output) : output.toList = issues input := by
  change lower input = .rejected output at failure
  unfold lower at failure
  split at failure
  · cases failure
  · rename_i head tail present
    cases failure
    exact present.symm

theorem issues_reject {input : Input} {issue : Issue} (member : issue ∈ issues input) :
    ∃ output, model.lower input = .rejected output ∧ issue ∈ output.toList := by
  cases present : issues input with
  | nil => simp [present] at member
  | cons head tail =>
    exact ⟨⟨head, tail⟩, by simp [model, lower, present],
      by simpa [present, NonemptyList.toList] using member⟩

theorem issueKey_injective {left right : Issue} (equal : IssueKey left = IssueKey right) :
    left = right := by
  cases left with
  | missingFile leftPath =>
    cases right with
    | missingFile rightPath =>
      simp [IssueKey] at equal
      exact congrArg Issue.missingFile (packagePath_eq_of_value_eq equal)
    | _ => simp [IssueKey] at equal
  | notExecutable leftPath =>
    cases right with
    | notExecutable rightPath =>
      simp [IssueKey] at equal
      exact congrArg Issue.notExecutable (packagePath_eq_of_value_eq equal)
    | _ => simp [IssueKey] at equal
  | missingDirectory leftPath =>
    cases right with
    | missingDirectory rightPath =>
      simp [IssueKey] at equal
      exact congrArg Issue.missingDirectory (packagePath_eq_of_value_eq equal)
    | _ => simp [IssueKey] at equal
  | environmentReferenceUnsupported leftName =>
    cases right with
    | environmentReferenceUnsupported rightName =>
      simp [IssueKey] at equal
      exact congrArg Issue.environmentReferenceUnsupported
        (environmentName_eq_of_value_eq equal)
    | _ => simp [IssueKey] at equal
  | environmentCollision leftName =>
    cases right with
    | environmentCollision rightName =>
      simp [IssueKey] at equal
      exact congrArg Issue.environmentCollision
        (environmentName_eq_of_value_eq equal)
    | _ => simp [IssueKey] at equal

theorem environmentNames_nodup_of_issues_empty {input : Input}
    (absent : issues input = []) : (input.definition.environment.map Prod.fst).Nodup := by
  exact ((issues_empty_iff_representable input).mp absent).2.2.2.1

theorem filePresent_perm {left right : Input} (permutation : left.files.Perm right.files)
    (path : PackagePath) : FilePresent left path ↔ FilePresent right path := by
  unfold FilePresent
  constructor
  · rintro ⟨asset, ⟨member, pathEqual⟩⟩
    exact ⟨asset, ⟨permutation.mem_iff.mp member, pathEqual⟩⟩
  · rintro ⟨asset, ⟨member, pathEqual⟩⟩
    exact ⟨asset, ⟨permutation.mem_iff.mpr member, pathEqual⟩⟩

theorem directoryPresent_perm {left right : Input} (permutation : left.files.Perm right.files)
    (path : PackagePath) : DirectoryPresent left path ↔ DirectoryPresent right path := by
  unfold DirectoryPresent
  constructor
  · rintro ⟨asset, ⟨member, descendant⟩⟩
    exact ⟨asset, ⟨permutation.mem_iff.mp member, descendant⟩⟩
  · rintro ⟨asset, ⟨member, descendant⟩⟩
    exact ⟨asset, ⟨permutation.mem_iff.mpr member, descendant⟩⟩

theorem referencesEnvironment_perm {left right : Input}
    (permutation : left.definition.environment.Perm right.definition.environment)
    (name : EnvironmentName) :
    ReferencesEnvironment left.definition name ↔ ReferencesEnvironment right.definition name := by
  unfold ReferencesEnvironment
  constructor
  · rintro ⟨binding, ⟨member, reference⟩⟩
    exact ⟨binding, ⟨permutation.mem_iff.mp member, reference⟩⟩
  · rintro ⟨binding, ⟨member, reference⟩⟩
    exact ⟨binding, ⟨permutation.mem_iff.mpr member, reference⟩⟩

theorem requiredIssue_perm {left right : Input}
    (hostEqual : left.host = right.host)
    (commandEqual : left.definition.command = right.definition.command)
    (argsEqual : left.definition.args = right.definition.args)
    (cwdEqual : left.definition.cwd = right.definition.cwd)
    (environmentPermutation : left.definition.environment.Perm right.definition.environment)
    (filesPermutation : left.files.Perm right.files) (issue : Issue) :
    RequiredIssue left issue ↔ RequiredIssue right issue := by
  cases issue with
  | missingFile path =>
    simp only [RequiredIssue, RequiredFile, commandEqual, argsEqual]
    rw [filePresent_perm filesPermutation path]
  | notExecutable path =>
    simp only [RequiredIssue, commandEqual]
    rw [filePresent_perm filesPermutation path]
    constructor
    · rintro ⟨command, ⟨present, ⟨asset, ⟨member, ⟨pathEqual, notExecutable⟩⟩⟩⟩⟩
      exact ⟨command, ⟨present, ⟨asset, ⟨filesPermutation.mem_iff.mp member,
        ⟨pathEqual, notExecutable⟩⟩⟩⟩⟩
    · rintro ⟨command, ⟨present, ⟨asset, ⟨member, ⟨pathEqual, notExecutable⟩⟩⟩⟩⟩
      exact ⟨command, ⟨present, ⟨asset, ⟨filesPermutation.mem_iff.mpr member,
        ⟨pathEqual, notExecutable⟩⟩⟩⟩⟩
  | missingDirectory path =>
    simp only [RequiredIssue, cwdEqual]
    rw [directoryPresent_perm filesPermutation path]
  | environmentReferenceUnsupported name =>
    simp only [RequiredIssue]
    constructor
    · rintro ⟨host, reference⟩
      exact ⟨hostEqual.symm.trans host,
        (referencesEnvironment_perm environmentPermutation name).mp reference⟩
    · rintro ⟨host, reference⟩
      exact ⟨hostEqual.trans host,
        (referencesEnvironment_perm environmentPermutation name).mpr reference⟩
  | environmentCollision name =>
    simp only [RequiredIssue]
    have namesPermutation := environmentPermutation.map Prod.fst
    rw [namesPermutation.count name]

end PluginSdk.Compiler.Process
