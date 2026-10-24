import PluginSdk.Compiler.Process.Properties

namespace PluginSdk.Compiler.Process.Launcher

structure Capture where
  source : EnvironmentName
  raw : String
  check : String
  deriving DecidableEq

inductive SnapshotWord where
  | literal (value : String)
  | root
  | file (path : PackagePath)
  | captured (capture : Capture)
  deriving DecidableEq

structure Script where
  names : List EnvironmentName
  captures : List Capture
  snapshot : List SnapshotWord
  command : Nat
  args : List Nat
  environment : List (EnvironmentName × Nat)
  cwd : Nat
  deriving DecidableEq

structure Native where
  command : String
  args : List String
  environment : List (String × String)
  cwd : Option String
  deriving DecidableEq

structure Invocation where
  command : String
  args : List String
  environment : List (EnvironmentName × String)
  cwd : String
  deriving DecidableEq

structure Interface where
  capture : EnvironmentName → String → String → Option String
  compile : Plan → Script
  native : Host → PackagePath → Script → Option Native
  transferName : Script → EnvironmentName → String

def placeholder (name : EnvironmentName) : String := "$" ++ "{" ++ name.value ++ "}"
def fallback : String := "PSDK_ABSENT"
def rawValue (ambient : EnvironmentName → Option String) (name : EnvironmentName) : String :=
  (ambient name).getD (placeholder name)
def checkValue (ambient : EnvironmentName → Option String) (name : EnvironmentName) : String :=
  (ambient name).getD fallback

def words (plan : Plan) : List Word :=
  [plan.command, plan.cwd] ++ plan.args ++ plan.environment.map Prod.snd

def references : Word → List EnvironmentName
  | .environment name => [name]
  | .literal _ | .root | .file _ => []

def requestedNames (plan : Plan) : List EnvironmentName :=
  plan.environment.map Prod.fst ++ (words plan).flatMap references

def SnapshotWord.resolve (model : Interface) (root : String)
    (ambient : EnvironmentName → Option String) : SnapshotWord → Option String
  | .literal value => some value
  | .root => some root
  | .file path => some (AtRoot root path)
  | .captured capture =>
      model.capture capture.source (rawValue ambient capture.source)
        (checkValue ambient capture.source)

def execute (model : Interface) (script : Script) (root : String)
    (ambient : EnvironmentName → Option String) : Option Invocation := do
  if script.captures.any (fun capture =>
      (model.capture capture.source (rawValue ambient capture.source)
        (checkValue ambient capture.source)).isNone) then none
  else do
    let snapshot ← script.snapshot.mapM (SnapshotWord.resolve model root ambient)
    let parameters := root :: snapshot
    return ⟨← parameters[script.command]?,
      ← script.args.mapM (fun index => parameters[index]?),
      ← script.environment.mapM (fun binding => do
        return (binding.1, ← parameters[binding.2]?)),
      ← parameters[script.cwd]?⟩

def expected (plan : Plan) (root : String) (ambient : EnvironmentName → String) : Invocation :=
  ⟨plan.command.resolve root ambient, plan.args.map (Word.resolve root ambient),
    plan.environment.map (fun binding => (binding.1, binding.2.resolve root ambient)),
    plan.cwd.resolve root ambient⟩

def L1_capture_exact (model : Interface) : Prop :=
  ∀ name ambient, model.capture name (rawValue ambient name) (checkValue ambient name) =
    ambient name

def L2_names_valid_fresh (model : Interface) : Prop :=
  ∀ plan capture, capture ∈ (model.compile plan).captures →
    ValidEnvironmentName capture.raw ∧ ValidEnvironmentName capture.check ∧
    ∀ name ∈ requestedNames plan, capture.raw ≠ name.value ∧ capture.check ≠ name.value

def L3_capture_coverage_distinct (model : Interface) : Prop :=
  ∀ plan,
    (∀ name, name ∈ (words plan).flatMap references ↔
      ∃ capture ∈ (model.compile plan).captures, capture.source = name) ∧
    ((model.compile plan).captures.flatMap (fun capture => [capture.raw, capture.check])).Nodup ∧
    ∀ capture, .captured capture ∈ (model.compile plan).snapshot ↔
      capture ∈ (model.compile plan).captures

def L4_complete_process_preserved (model : Interface) : Prop :=
  ∀ plan root ambient,
    execute model (model.compile plan) root (fun name => some (ambient name)) =
      some (expected plan root ambient)

def L5_missing_source_stops (model : Interface) : Prop :=
  ∀ plan root ambient name, name ∈ (words plan).flatMap references →
    ambient name = none → execute model (model.compile plan) root ambient = none

def rootVariable : Host → String
  | .claudeCode => "$" ++ "{CLAUDE_PLUGIN_ROOT}"
  | .codex => "$" ++ "{PLUGIN_ROOT}"

def nativeBindings (script : Script) : List (String × String) :=
  script.captures.flatMap (fun capture =>
    [(capture.raw, placeholder capture.source),
      (capture.check, "$" ++ "{" ++ capture.source.value ++ ":-" ++ fallback ++ "}")])

def L6_native_shape_exact (model : Interface) : Prop :=
  (∀ host path script, (∃ native, model.native host path script = some native) ↔
    host = .claudeCode ∨ script.captures = []) ∧
  (∀ host path script native, model.native host path script = some native →
    native.command = (match host with
      | .claudeCode => rootVariable host ++ "/" ++ path.value
      | .codex => "./" ++ path.value) ∧
    native.args = [rootVariable host] ∧ native.environment = nativeBindings script ∧
    native.cwd = (match host with | .claudeCode => none | .codex => some (rootVariable host)))

def L7_transfer_names_safe (model : Interface) : Prop :=
  ∀ plan,
    (∀ name, ValidEnvironmentName (model.transferName (model.compile plan) name)) ∧
    (∀ name requested, requested ∈ requestedNames plan →
      model.transferName (model.compile plan) name ≠ requested.value) ∧
    (∀ name capture, capture ∈ (model.compile plan).captures →
      model.transferName (model.compile plan) name ≠ capture.raw ∧
      model.transferName (model.compile plan) name ≠ capture.check) ∧
    ∀ left right, model.transferName (model.compile plan) left =
      model.transferName (model.compile plan) right → left = right

end PluginSdk.Compiler.Process.Launcher
