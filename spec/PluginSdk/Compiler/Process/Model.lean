import PluginSdk.Compiler.Process.Properties
import PluginSdk.Compiler.Canonical

namespace PluginSdk.Compiler.Process

def referencedFiles (definition : Definition) : List PackagePath :=
  (match definition.command with
    | .external _ => []
    | .file path => [path]) ++
  definition.args.filterMap fun argument =>
    match argument with
    | .literal _ => none
    | .file path => some path

def containsFile (input : Input) (path : PackagePath) : Bool :=
  input.files.any fun asset => decide (asset.path = path)

def containsDirectory (input : Input) (path : PackagePath) : Bool :=
  input.files.any fun asset => asset.path.value.startsWith (path.value ++ "/")

def missingPaths (input : Input) : List PackagePath :=
  (referencedFiles input.definition).filterMap fun path =>
    if containsFile input path then none else some path

def notExecutablePaths (input : Input) : List PackagePath :=
  match input.definition.command with
  | .external _ => []
  | .file path =>
    input.files.filterMap fun asset =>
      if asset.path = path ∧ asset.file.executable = false then
        some path
      else none

def missingDirectoryPaths (input : Input) : List PackagePath :=
  input.definition.cwd.toList.filterMap fun path =>
    if containsDirectory input path then none else some path

def unsupportedEnvironmentNames (input : Input) : List EnvironmentName :=
  match input.host with
  | .claudeCode => []
  | .codex => input.definition.environment.filterMap fun binding =>
    match binding.2 with
    | .literal _ => none
    | .reference name => some name

def collidingEnvironmentNames (input : Input) : List EnvironmentName :=
  (input.definition.environment.map Prod.fst).filterMap fun name =>
    if 1 < (input.definition.environment.map Prod.fst).count name then
      some name
    else none

def missingFileIssues (input : Input) : List Issue :=
  (missingPaths input).map Issue.missingFile

def notExecutableIssues (input : Input) : List Issue :=
  (notExecutablePaths input).map Issue.notExecutable

def missingDirectoryIssues (input : Input) : List Issue :=
  (missingDirectoryPaths input).map Issue.missingDirectory

def unsupportedEnvironmentIssues (input : Input) : List Issue :=
  (unsupportedEnvironmentNames input).map Issue.environmentReferenceUnsupported

def environmentCollisionIssues (input : Input) : List Issue :=
  (collidingEnvironmentNames input).map Issue.environmentCollision

def rawIssues (input : Input) : List Issue :=
  missingFileIssues input ++
  notExecutableIssues input ++
  missingDirectoryIssues input ++
  unsupportedEnvironmentIssues input ++
  environmentCollisionIssues input

def issues (input : Input) : List Issue :=
  Compiler.ordered IssueKey (Compiler.unique (rawIssues input))

private theorem executableName_noNul (name : ExecutableName) :
    '\x00' ∉ name.value.toList := by
  intro member
  have valid := name.valid.2.2.2.2 '\x00' member
  simp [AsciiLetter] at valid

def executableText (name : ExecutableName) : Text :=
  ⟨name.value, executableName_noNul name⟩

def lowerProgram : Program → Word
  | .external name => .literal (executableText name)
  | .file path => .file path

def lowerArgument : Argument → Word
  | .literal text => .literal text
  | .file path => .file path

def lowerEnvironmentValue : EnvironmentValue → Word
  | .literal text => .literal text
  | .reference name => .environment name

def lowerBinding (binding : EnvironmentName × EnvironmentValue) : EnvironmentName × Word :=
  (binding.1, lowerEnvironmentValue binding.2)

def environmentKey (binding : EnvironmentName × Word) : Compiler.Key :=
  [binding.1.value]

def planEnvironment (definition : Definition) : List (EnvironmentName × Word) :=
  Compiler.ordered environmentKey (definition.environment.map lowerBinding)

def planOf (input : Input) : Plan :=
  { command := lowerProgram input.definition.command
    args := input.definition.args.map lowerArgument
    environment := planEnvironment input.definition
    cwd := input.definition.cwd.elim .root .file }

def lower (input : Input) : Result :=
  match issues input with
  | [] => .planned (planOf input)
  | head :: tail => .rejected ⟨head, tail⟩

def model : Interface := ⟨lower⟩

end PluginSdk.Compiler.Process
