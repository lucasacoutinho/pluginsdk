namespace PluginSdk.Installer.ProjectFile

abbrev PosixMode := Fin 4096
abbrev Attributes := Fin 4294967296

inductive Streams where
  | defaultOnly
  | additional
  | unavailable
  deriving DecidableEq, Repr

inductive Basis where
  | absent
  | file (digest : String) (mode : PosixMode)
  | windowsFile (digest : String) (attributes : Attributes) (security : String)
  deriving DecidableEq, Repr

inductive Observation where
  | absent
  | file (digest : String) (mode : PosixMode)
  | windowsFile (digest : String) (attributes : Attributes) (security : String) (streams : Streams)
  deriving DecidableEq, Repr

structure Input where
  platform : String
  observed : Observation
  deriving DecidableEq, Repr

structure ReviewInput where
  current : Input
  reviewed : Basis
  deriving DecidableEq, Repr

inductive Reason where
  | platform
  | representation
  | attributes
  | streams
  | changed
  deriving DecidableEq, Repr

inductive Decision where
  | ready (basis : Basis)
  | blocked (reason : Reason)
  deriving DecidableEq, Repr

def SupportedAttributes (attributes : Attributes) : Prop :=
  attributes.val = 128 ∨ (0 < attributes.val ∧ attributes.val &&& 0xffffdfd9 = 0)

instance (attributes : Attributes) : Decidable (SupportedAttributes attributes) := by
  unfold SupportedAttributes
  infer_instance

structure Interface where
  admit : Input → Decision
  review : ReviewInput → Decision

end PluginSdk.Installer.ProjectFile
