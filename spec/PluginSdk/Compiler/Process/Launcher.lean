import PluginSdk.Compiler.Process.LauncherTypes
import PluginSdk.Compiler.Canonical
import PluginSdk.Compiler.Process.Quoting

namespace PluginSdk.Compiler.Process.Launcher

def readCapture (name : EnvironmentName) (raw check : String) : Option String :=
  if raw = placeholder name ∧ check ≠ raw then none else some raw

def bound : List EnvironmentName → Nat
  | [] => 0
  | name :: rest => max name.value.toList.length (bound rest)

inductive Kind where
  | raw
  | check
  deriving DecidableEq

def marker : Kind → Char
  | .raw => 'A'
  | .check => 'B'

def freshName (names : List EnvironmentName) (kind : Kind) (source : EnvironmentName) : String :=
  String.ofList ("PSDK_".toList ++ List.replicate (bound names) '_' ++
    marker kind :: '_' :: source.value.toList)

def captureFor (names : List EnvironmentName) (source : EnvironmentName) : Capture :=
  ⟨source, freshName names .raw source, freshName names .check source⟩

def snapshotWord (names : List EnvironmentName) : Word → SnapshotWord
  | .literal text => .literal text.value
  | .root => .root
  | .file path => .file path
  | .environment name => .captured (captureFor names name)

def sourceNames (plan : Plan) : List EnvironmentName :=
  ordered (fun name => [name.value]) (unique ((words plan).flatMap references))

def slots {α : Type} (start : Nat) : List α → List Nat
  | [] => []
  | _ :: rest => start :: slots (start + 1) rest

def exports (start : Nat) : List (EnvironmentName × Word) → List (EnvironmentName × Nat)
  | [] => []
  | (name, _) :: rest => (name, start) :: exports (start + 1) rest

def compile (plan : Plan) : Script :=
  let names := requestedNames plan
  ⟨names, (sourceNames plan).map (captureFor names), (words plan).map (snapshotWord names),
    1, slots 3 plan.args, exports (3 + plan.args.length) plan.environment, 2⟩

def native (host : Host) (path : PackagePath) (script : Script) : Option Native :=
  match host with
  | .claudeCode =>
      some ⟨rootVariable host ++ "/" ++ path.value, [rootVariable host],
        nativeBindings script, none⟩
  | .codex =>
      if script.captures = [] then
        some ⟨"./" ++ path.value, [rootVariable host], nativeBindings script,
          some (rootVariable host)⟩
      else none

def transferName (script : Script) (name : EnvironmentName) : String :=
  "S" ++ freshName script.names .raw name

def model : Interface := ⟨readCapture, compile, native, transferName⟩

def shellVariable (name : String) : String := "\"$" ++ "{" ++ name ++ "}\""
def parameter (index : Nat) : String := shellVariable (toString (index + 1))

def renderWord : SnapshotWord → String
  | .literal value => Quoting.quote value
  | .root => parameter 0
  | .file path => parameter 0 ++ "/" ++ Quoting.quote path.value
  | .captured capture => shellVariable capture.raw

def renderGuard (capture : Capture) : String :=
  "if [ " ++ shellVariable capture.raw ++ " = " ++ Quoting.quote (placeholder capture.source) ++
    " ] && [ " ++ shellVariable capture.check ++ " != " ++ shellVariable capture.raw ++ " ]; then\n" ++
    "  printf '%s\\n' " ++ Quoting.quote ("Missing environment variable: " ++ capture.source.value) ++
    " >&2\n  exit 1\nfi\n"

def header : String := "#!/bin/sh\nset -eu\n"

def serializeBody (script : Script) : String :=
    String.join (script.captures.map renderGuard) ++
    "set -- " ++ String.intercalate " " (parameter 0 :: script.snapshot.map renderWord) ++ "\n" ++
    (if script.captures = [] then "" else
      "unset " ++ String.intercalate " "
        (script.captures.flatMap (fun capture => [capture.raw, capture.check])) ++ "\n") ++
    "cd " ++ parameter script.cwd ++ "\n" ++
    String.join (script.environment.map (fun binding =>
      "export " ++ transferName script binding.1 ++ "=" ++ parameter binding.2 ++ "\n")) ++
    "exec " ++
    (if script.environment = [] then "" else
      "/usr/bin/env " ++
      String.join (script.environment.map (fun binding => "-u " ++ transferName script binding.1 ++ " ")) ++
      "-S " ++ Quoting.quote (String.intercalate " " (script.environment.map (fun binding =>
        binding.1.value ++ "=$" ++ "{" ++ transferName script binding.1 ++ "}"))) ++ " ") ++
    String.intercalate " " (parameter script.command :: script.args.map parameter) ++ "\n"

def serialize (script : Script) : String := header ++ serializeBody script

end PluginSdk.Compiler.Process.Launcher
