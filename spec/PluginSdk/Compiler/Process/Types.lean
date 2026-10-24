import PluginSdk.Compiler.Types

namespace PluginSdk.Compiler.Process

def AsciiLetter (c : Char) : Prop :=
  ('a' ≤ c ∧ c ≤ 'z') ∨ ('A' ≤ c ∧ c ≤ 'Z')

def ValidEnvironmentName (value : String) : Prop :=
  ∃ first rest, value.toList = first :: rest ∧
    (AsciiLetter first ∨ first = '_') ∧
    ∀ c ∈ rest, AsciiLetter c ∨ ('0' ≤ c ∧ c ≤ '9') ∨ c = '_'

structure EnvironmentName where
  value : String
  valid : ValidEnvironmentName value
  deriving DecidableEq

def ValidExecutableName (value : String) : Prop :=
  value ≠ "" ∧ value ≠ "." ∧ value ≠ ".." ∧ value.startsWith "-" = false ∧
  ∀ c ∈ value.toList,
    AsciiLetter c ∨ ('0' ≤ c ∧ c ≤ '9') ∨ c = '_' ∨ c = '.' ∨ c = '+' ∨ c = '-'

structure ExecutableName where
  value : String
  valid : ValidExecutableName value
  deriving DecidableEq

structure Text where
  value : String
  noNul : '\x00' ∉ value.toList
  deriving DecidableEq

inductive Host where
  | claudeCode
  | codex
  deriving DecidableEq, Repr

inductive Program where
  | external (name : ExecutableName)
  | file (path : PackagePath)
  deriving DecidableEq

inductive Argument where
  | literal (text : Text)
  | file (path : PackagePath)
  deriving DecidableEq

inductive EnvironmentValue where
  | literal (text : Text)
  | reference (name : EnvironmentName)
  deriving DecidableEq

structure Definition where
  command : Program
  args : List Argument
  environment : List (EnvironmentName × EnvironmentValue)
  cwd : Option PackagePath
  deriving DecidableEq

structure Input where
  host : Host
  definition : Definition
  files : List Asset

inductive Word where
  | literal (text : Text)
  | root
  | file (path : PackagePath)
  | environment (name : EnvironmentName)
  deriving DecidableEq

structure Plan where
  command : Word
  args : List Word
  environment : List (EnvironmentName × Word)
  cwd : Word
  deriving DecidableEq

inductive Issue where
  | missingFile (path : PackagePath)
  | notExecutable (path : PackagePath)
  | missingDirectory (path : PackagePath)
  | environmentReferenceUnsupported (name : EnvironmentName)
  | environmentCollision (name : EnvironmentName)
  deriving DecidableEq

inductive Result where
  | planned (plan : Plan)
  | rejected (issues : NonemptyList Issue)

structure Interface where
  lower : Input → Result

end PluginSdk.Compiler.Process
