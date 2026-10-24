import PluginSdk.Compiler.Process.Portable.Types
import PluginSdk.Compiler.Canonical
import PluginSdk.Compiler.Process.Launcher

namespace PluginSdk.Compiler.Process.Portable

def destinationKeys (plan : Plan) : List String :=
  plan.environment.map (fun binding => asciiFold binding.1.value)

def Representable (input : Input) : Prop :=
  (destinationKeys input.plan).Nodup ∧
    (input.host = .codex → (Launcher.words input.plan).flatMap Launcher.references = [])

def RequiredIssue (input : Input) : Issue → Prop
  | .environmentCollision name => 1 < (destinationKeys input.plan).count name
  | .environmentReferenceUnsupported name =>
      input.host = .codex ∧ name ∈ (Launcher.words input.plan).flatMap Launcher.references

def IssueKey : Issue → Key
  | .environmentCollision name => ["environment_collision", name]
  | .environmentReferenceUnsupported name => ["environment_reference_unsupported", name.value]

def PL1_exact_admission (model : Interface) : Prop :=
  ∀ input, (∃ program, model.build input = .rendered program) ↔ Representable input

def execution (model : Interface) : Launcher.Interface :=
  { Launcher.model with compile := model.compile }

def PL2_complete_process (model : Interface) : Prop :=
  ∀ input program root ambient, model.build input = .rendered program →
    Launcher.execute (execution model) program.script root (fun name => some (ambient name)) =
      some (Launcher.expected input.plan root ambient)

def PL3_missing_source_stops (model : Interface) : Prop :=
  ∀ input program root ambient name, model.build input = .rendered program →
    name ∈ (Launcher.words input.plan).flatMap Launcher.references → ambient name = none →
    Launcher.execute (execution model) program.script root ambient = none

def PL4_capture_names (model : Interface) : Prop :=
  ∀ plan,
    let names := (model.compile plan).captures.flatMap (fun capture => [capture.raw, capture.check])
    (∀ name ∈ names, ValidEnvironmentName name) ∧
    names.Pairwise (fun left right => asciiFold left ≠ asciiFold right) ∧
    ∀ generated ∈ names, ∀ requested ∈ Launcher.requestedNames plan,
      asciiFold generated ≠ asciiFold requested.value

def PL5_native_shape (model : Interface) : Prop :=
  ∀ input program, model.build input = .rendered program →
    program.native.command = "node" ∧
    program.native.args = (match input.host with
      | .claudeCode => [Launcher.rootVariable input.host ++ "/" ++ runtimePath,
          Launcher.rootVariable input.host, input.path.value]
      | .codex => [runtimePath, ".", input.path.value]) ∧
    program.native.environment = Launcher.nativeBindings program.script ∧
    program.native.cwd = (match input.host with
      | .claudeCode => none
      | .codex => some ".")

def PL6_posix_encoding (model : Interface) : Prop :=
  ∀ input program, model.build input = .rendered program → program.posix = Launcher.serialize program.script

def PL7_diagnostics (model : Interface) : Prop :=
  (∀ input issue, RequiredIssue input issue ↔
    ∃ issues, model.build input = .rejected issues ∧ issue ∈ issues.toList) ∧
  ∀ input issues, model.build input = .rejected issues →
    issues.toList.Pairwise (fun left right => KeyBefore (IssueKey left) (IssueKey right))

end PluginSdk.Compiler.Process.Portable
