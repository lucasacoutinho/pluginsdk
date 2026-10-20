namespace PluginSdk

structure PlanId where
  value : String
  deriving DecidableEq, Repr

structure BundleDigest where
  value : String
  deriving DecidableEq, Repr

structure Fingerprint where
  value : String
  deriving DecidableEq, Repr

structure FileDigest where
  value : String
  deriving DecidableEq, Repr

structure NonemptyList (α : Type) where
  head : α
  tail : List α

def NonemptyList.toList {α : Type} (xs : NonemptyList α) : List α := xs.head :: xs.tail

def SafeSegment (segment : String) : Prop :=
  segment ≠ "" ∧ segment ≠ "." ∧ segment ≠ ".." ∧
  ∀ c ∈ segment.toList, c ≠ '/' ∧ c ≠ '\\' ∧ c ≠ '\x00'

def NoDrive (first : String) : Prop :=
  match first.toList with
  | letter :: second :: _ => second ≠ ':' ∨
      ¬ (('a' ≤ letter ∧ letter ≤ 'z') ∨ ('A' ≤ letter ∧ letter ≤ 'Z'))
  | _ => True

def Contained (path : String) : Prop :=
  ∃ first rest, path = String.intercalate "/" (first :: rest) ∧
    SafeSegment first ∧ (∀ segment ∈ rest, SafeSegment segment) ∧ NoDrive first

structure PackagePath where
  value : String
  contained : Contained value
  deriving DecidableEq

def ValidSkillName (name : String) : Prop :=
  1 ≤ name.length ∧ name.length ≤ 64 ∧
  (∀ c ∈ name.toList, ('a' ≤ c ∧ c ≤ 'z') ∨ ('0' ≤ c ∧ c ≤ '9') ∨ c = '-') ∧
  name.startsWith "-" = false ∧ name.endsWith "-" = false ∧
  (name.splitOn "--").length = 1

structure SkillName where
  value : String
  valid : ValidSkillName value
  deriving DecidableEq

inductive Format where
  | agentPluginsV1
  | claudeCodeV1
  deriving DecidableEq, Repr

def asciiFold (value : String) : String :=
  value.map fun c => if c.toNat < 128 then c.toLower else c

def PathsConflict (left right : String) : Prop :=
  asciiFold left = asciiFold right ∨
  (asciiFold left).startsWith (asciiFold right ++ "/") = true ∨
  (asciiFold right).startsWith (asciiFold left ++ "/") = true

def Utf8Before (left right : String) : Prop :=
  List.Lex (fun (a b : UInt8) => a.toNat < b.toNat)
    left.toUTF8.data.toList right.toUTF8.data.toList

end PluginSdk
