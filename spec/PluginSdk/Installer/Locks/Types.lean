namespace PluginSdk.Installer.Locks

inductive Scope where
  | user (home : String)
  | project (home root : String)
  deriving DecidableEq

inductive Subject where
  | home (root : String)
  | project (root : String)
  deriving DecidableEq

structure Interface where
  subjects : Scope → List Subject

end PluginSdk.Installer.Locks
