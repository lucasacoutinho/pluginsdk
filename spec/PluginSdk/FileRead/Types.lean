namespace PluginSdk.FileRead

structure Identity where
  volume : String
  file : String
  deriving DecidableEq, Repr

structure Anchor where
  identity : Identity
  path : String
  caseSensitive : Bool
  deriving DecidableEq, Repr

structure FileInfo where
  identity : Identity
  path : String
  size : String
  modified : String
  changed : String
  deriving DecidableEq, Repr

inductive Observation where
  | unavailable
  | directory (anchor : Anchor)
  | file (info : FileInfo)
  | other
  deriving DecidableEq, Repr

def Observation.path : Observation → Option String
  | .directory anchor => some anchor.path
  | .file info => some info.path
  | .unavailable | .other => none

structure Snapshot where
  root : Observation
  file : Observation
  deriving DecidableEq, Repr

inductive ReadResult where
  | complete (length : String)
  | failed
  deriving DecidableEq, Repr

structure ReadInput where
  root : Anchor
  before : Snapshot
  after : Snapshot
  read : ReadResult
  deriving DecidableEq, Repr

def ReadInput.paths (input : ReadInput) : List String :=
  input.root.path :: [input.before.root, input.after.root,
    input.before.file, input.after.file].filterMap Observation.path

structure CanonicalPath where
  volume : String
  components : List String
  deriving DecidableEq, Repr

inductive ParsedPath where
  | plain (path : CanonicalPath)
  | stream
  | unsupported
  deriving DecidableEq, Repr

inductive ReadDecision where
  | accepted | unavailable | notRegular | stream | outside | changed
  deriving DecidableEq, Repr

structure Interface where
  parsePath : String → ParsedPath
  inside : CanonicalPath → CanonicalPath → Bool
  admit : ReadInput → ReadDecision

end PluginSdk.FileRead
