import PluginSdk.FileRead.Types

namespace PluginSdk.TreeRead

open PluginSdk.FileRead (Identity Anchor FileInfo Observation)

inductive Policy where
  | source | payload
  deriving DecidableEq, Repr

structure ReparseInfo where
  identity : Identity
  path : String
  tag : Nat
  deriving DecidableEq, Repr

inductive EntryObservation where
  | unavailable
  | directory (anchor : Anchor)
  | file (info : FileInfo)
  | reparse (info : ReparseInfo)
  | other
  deriving DecidableEq, Repr

def EntryObservation.path : EntryObservation → Option String
  | .directory anchor => some anchor.path
  | .file info => some info.path
  | .reparse info => some info.path
  | .unavailable | .other => none

def EntryObservation.identity : EntryObservation → Option Identity
  | .directory anchor => some anchor.identity
  | .file info => some info.identity
  | .reparse info => some info.identity
  | .unavailable | .other => none

structure Branch where
  parent : Anchor
  ancestors : List Anchor
  deriving DecidableEq, Repr

def Branch.anchors (branch : Branch) : List Anchor := branch.parent :: branch.ancestors
def Branch.root (branch : Branch) : Anchor := branch.ancestors.getLastD branch.parent

structure EntryInput where
  policy : Policy
  root : Anchor
  branch : Branch
  name : String
  entry : EntryObservation
  target : Observation
  deriving DecidableEq, Repr

def EntryInput.paths (input : EntryInput) : List String :=
  input.root.path :: input.branch.anchors.map (·.path) ++
    input.entry.path.toList ++ input.target.path.toList

inductive EntryDecision where
  | accepted | unavailable | notRegular | stream | changed | outside | nameMismatch | reparse | cycle
  deriving DecidableEq, Repr

structure DirectoryInfo where
  anchor : Anchor
  modified : String
  changed : String
  deriving DecidableEq, Repr

inductive DirectoryObservation where
  | unavailable
  | directory (info : DirectoryInfo)
  | other
  deriving DecidableEq, Repr

def DirectoryObservation.path : DirectoryObservation → Option String
  | .directory info => some info.anchor.path
  | .unavailable | .other => none

structure DirectorySnapshot where
  root : Observation
  directory : DirectoryObservation
  deriving DecidableEq, Repr

inductive Enumeration where
  | complete (names : List String)
  | failed
  deriving DecidableEq, Repr

def Enumeration.names : Enumeration → List String
  | .complete names => names
  | .failed => []

structure DirectoryInput where
  root : Anchor
  directory : Anchor
  before : DirectorySnapshot
  after : DirectorySnapshot
  enumeratedBefore : Enumeration
  enumeratedAfter : Enumeration
  visited : List String
  deriving DecidableEq, Repr

def DirectoryInput.paths (input : DirectoryInput) : List String :=
  [input.root.path, input.directory.path] ++
    input.before.root.path.toList ++ input.after.root.path.toList ++
    input.before.directory.path.toList ++ input.after.directory.path.toList

inductive DirectoryDecision where
  | accepted | unavailable | notDirectory | stream | changed | outside | duplicate | incomplete
  deriving DecidableEq, Repr

structure Interface where
  entry : EntryInput → EntryDecision
  directory : DirectoryInput → DirectoryDecision

end PluginSdk.TreeRead
