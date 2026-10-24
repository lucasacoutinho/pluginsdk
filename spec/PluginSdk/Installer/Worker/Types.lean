namespace PluginSdk.Installer.Worker

inductive State where
  | waiting | accepted | stopped
  deriving DecidableEq, Repr

inductive Signal where
  | request | invalid | disconnect
  deriving DecidableEq, Repr

inductive Action where
  | start | stop | ignore
  deriving DecidableEq, Repr

structure Input where
  state : State
  signal : Signal
  deriving DecidableEq, Repr

structure Step where
  state : State
  action : Action
  deriving DecidableEq, Repr

structure Interface where
  admit : Input → Step

end PluginSdk.Installer.Worker
