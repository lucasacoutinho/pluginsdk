import PluginSdk.Catalog.Artifacts.Types
import PluginSdk.Catalog.Model
import PluginSdk.Catalog.Rules
import PluginSdk.Compiler.Canonical

namespace PluginSdk.Catalog.Artifacts

def allFormats : List PackageFormat :=
  [.claudeCode, .codex]

def formatIssues (input : Input) (format : PackageFormat) : List Issue :=
  let count := countFormat input.artifacts format
  let packagePresence :=
    match Catalog.packageDigest input.packages format with
    | none => if count = 0 then [] else [.unexpectedPackage format]
    | some _ => if count = 0 then [.missingPackage format] else []
  let duplicate := if 1 < count then [.duplicatePackage format] else []
  let pluginMismatch :=
    if ∃ artifact ∈ input.artifacts,
        artifact.format = format ∧ artifact.plugin ≠ input.plugin then
      [.pluginMismatch format]
    else []
  let versionMismatch :=
    if ∃ artifact ∈ input.artifacts,
        artifact.format = format ∧ artifact.version ≠ input.version then
      [.versionMismatch format]
    else []
  let digestMismatch :=
    match Catalog.packageDigest input.packages format with
    | none => []
    | some digest =>
      if ∃ artifact ∈ input.artifacts,
          artifact.format = format ∧ artifact.digest ≠ digest then
        [.digestMismatch format]
      else []
  packagePresence ++ duplicate ++ pluginMismatch ++ versionMismatch ++ digestMismatch

def rawIssues (input : Input) : List Issue :=
  allFormats.flatMap (formatIssues input)

def issues (input : Input) : List Issue :=
  Compiler.ordered IssueKey (Compiler.unique (rawIssues input))

def check (input : Input) : Result :=
  match issues input with
  | [] => .accepted
  | head :: tail => .rejected ⟨head, tail⟩

def model : Interface := ⟨check⟩

end PluginSdk.Catalog.Artifacts
