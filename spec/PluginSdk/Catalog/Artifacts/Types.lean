import PluginSdk.Catalog.Rules
import PluginSdk.Compiler.Canonical

namespace PluginSdk.Catalog.Artifacts

structure PackageDescriptor where
  plugin : String
  format : PackageFormat
  version : String
  digest : String
  deriving DecidableEq, Repr

structure Input where
  plugin : String
  version : String
  packages : FormatDigests
  artifacts : List PackageDescriptor

inductive Issue where
  | missingPackage (format : PackageFormat)
  | unexpectedPackage (format : PackageFormat)
  | duplicatePackage (format : PackageFormat)
  | pluginMismatch (format : PackageFormat)
  | versionMismatch (format : PackageFormat)
  | digestMismatch (format : PackageFormat)
  deriving DecidableEq, Repr

inductive Result where
  | accepted
  | rejected (issues : NonemptyList Issue)

structure Interface where
  check : Input → Result

def countFormat (artifacts : List PackageDescriptor) (format : PackageFormat) : Nat :=
  artifacts.countP (fun artifact => artifact.format == format)

def Realizes (input : Input) : Prop :=
  (∀ format digest, FormatDigest input.packages format digest → countFormat input.artifacts format = 1) ∧
  (∀ artifact ∈ input.artifacts,
    artifact.plugin = input.plugin ∧ artifact.version = input.version ∧
      FormatDigest input.packages artifact.format artifact.digest)

def RequiredIssue (input : Input) : Issue → Prop
  | .missingPackage format =>
      (∃ digest, FormatDigest input.packages format digest) ∧ countFormat input.artifacts format = 0
  | .unexpectedPackage format =>
      (¬ ∃ digest, FormatDigest input.packages format digest) ∧
        ∃ artifact ∈ input.artifacts, artifact.format = format
  | .duplicatePackage format => 1 < countFormat input.artifacts format
  | .pluginMismatch format =>
      ∃ artifact ∈ input.artifacts, artifact.format = format ∧ artifact.plugin ≠ input.plugin
  | .versionMismatch format =>
      ∃ artifact ∈ input.artifacts, artifact.format = format ∧ artifact.version ≠ input.version
  | .digestMismatch format =>
      ∃ artifact ∈ input.artifacts, artifact.format = format ∧
        ∃ digest, FormatDigest input.packages format digest ∧ artifact.digest ≠ digest

def FormatKey : PackageFormat → String
  | .claudeCode => "claude_code"
  | .codex => "codex"

def IssueKey : Issue → List String
  | .missingPackage format => ["missing_package", FormatKey format]
  | .unexpectedPackage format => ["unexpected_package", FormatKey format]
  | .duplicatePackage format => ["duplicate_package", FormatKey format]
  | .pluginMismatch format => ["plugin_mismatch", FormatKey format]
  | .versionMismatch format => ["version_mismatch", FormatKey format]
  | .digestMismatch format => ["digest_mismatch", FormatKey format]

end PluginSdk.Catalog.Artifacts
