namespace PluginSdk.Installer.LauncherRuntime

inductive Kind where
  | absent | posix (cwdRoot : Bool) | portable
  deriving DecidableEq, Repr

inductive Check where
  | node | shell | env | pwd
  deriving DecidableEq, Repr

structure Input where
  platform : String
  kind : Kind
  deriving DecidableEq, Repr

structure NodeObservation where
  platform : String
  major : Nat
  minor : Nat
  execve : Bool
  deriving DecidableEq, Repr

structure Interface where
  requirements : Input → Option (List Check)
  acceptsNode : NodeObservation → Bool

end PluginSdk.Installer.LauncherRuntime
