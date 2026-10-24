import PluginSdk.Compiler.Process.Types

namespace PluginSdk.Compiler.Process

def RequiredFile (definition : Definition) (path : PackagePath) : Prop :=
  definition.command = .file path ∨ .file path ∈ definition.args

def FilePresent (input : Input) (path : PackagePath) : Prop :=
  ∃ asset ∈ input.files, asset.path = path

def DirectoryPresent (input : Input) (path : PackagePath) : Prop :=
  ∃ asset ∈ input.files, asset.path.value.startsWith (path.value ++ "/") = true

def ReferencesEnvironment (definition : Definition) (name : EnvironmentName) : Prop :=
  ∃ binding ∈ definition.environment, binding.2 = .reference name

def RequiredIssue (input : Input) : Issue → Prop
  | .missingFile path => RequiredFile input.definition path ∧ ¬ FilePresent input path
  | .notExecutable path =>
      input.definition.command = .file path ∧ FilePresent input path ∧
      ∃ asset ∈ input.files, asset.path = path ∧ asset.file.executable = false
  | .missingDirectory path => input.definition.cwd = some path ∧ ¬ DirectoryPresent input path
  | .environmentReferenceUnsupported name =>
      input.host = .codex ∧ ReferencesEnvironment input.definition name
  | .environmentCollision name =>
      1 < (input.definition.environment.map Prod.fst).count name

def Representable (input : Input) : Prop :=
  (∀ path, RequiredFile input.definition path → FilePresent input path) ∧
  (∀ path, input.definition.command = .file path →
    ∀ asset ∈ input.files, asset.path = path → asset.file.executable = true) ∧
  (∀ path, input.definition.cwd = some path → DirectoryPresent input path) ∧
  (input.definition.environment.map Prod.fst).Nodup ∧
  (input.host = .codex → ∀ name, ¬ ReferencesEnvironment input.definition name)

def AtRoot (root : String) (path : PackagePath) : String := root ++ "/" ++ path.value

def ProgramValue (root : String) : Program → String
  | .external name => name.value
  | .file path => AtRoot root path

def ArgumentValue (root : String) : Argument → String
  | .literal text => text.value
  | .file path => AtRoot root path

def EnvironmentValue.resolve (ambient : EnvironmentName → String) : EnvironmentValue → String
  | .literal text => text.value
  | .reference name => ambient name

def Word.resolve (root : String) (ambient : EnvironmentName → String) : Word → String
  | .literal text => text.value
  | .root => root
  | .file path => AtRoot root path
  | .environment name => ambient name

def BindingValue {α : Type} (resolve : α → String)
    (bindings : List (EnvironmentName × α)) (name : EnvironmentName) : Option String :=
  (bindings.find? (fun binding => binding.1 == name)).map (fun binding => resolve binding.2)

def Preserves (definition : Definition) (plan : Plan) : Prop :=
  ∀ root ambient,
    plan.command.resolve root ambient = ProgramValue root definition.command ∧
    plan.args.map (Word.resolve root ambient) = definition.args.map (ArgumentValue root) ∧
    plan.cwd.resolve root ambient = (definition.cwd.map (AtRoot root)).getD root ∧
    ∀ name, BindingValue (Word.resolve root ambient) plan.environment name =
      BindingValue (EnvironmentValue.resolve ambient) definition.environment name

def IssueKey : Issue → List String
  | .missingFile path => ["missing_file", path.value]
  | .notExecutable path => ["not_executable", path.value]
  | .missingDirectory path => ["missing_directory", path.value]
  | .environmentReferenceUnsupported name => ["environment_reference_unsupported", name.value]
  | .environmentCollision name => ["environment_collision", name.value]

def M1_accepts_exactly_representable (model : Interface) : Prop :=
  ∀ input, (∃ plan, model.lower input = .planned plan) ↔ Representable input

def M2_preserves_process (model : Interface) : Prop :=
  ∀ input plan, model.lower input = .planned plan → Preserves input.definition plan

def M3_diagnostics_sound_complete (model : Interface) : Prop :=
  (∀ input issue, RequiredIssue input issue ↔
    ∃ issues, model.lower input = .rejected issues ∧ issue ∈ issues.toList) ∧
  (∀ input issues, model.lower input = .rejected issues →
    (issues.toList.map IssueKey).Pairwise (List.Lex Utf8Before))

def M4_canonical_environment (model : Interface) : Prop :=
  ∀ input plan, model.lower input = .planned plan →
    (plan.environment.map (fun binding => binding.1.value)).Pairwise Utf8Before

def M5_enumeration_invariant (model : Interface) : Prop :=
  ∀ left right, left.host = right.host →
    left.definition.command = right.definition.command →
    left.definition.args = right.definition.args → left.definition.cwd = right.definition.cwd →
    left.definition.environment.Perm right.definition.environment → left.files.Perm right.files →
    model.lower left = model.lower right

end PluginSdk.Compiler.Process
