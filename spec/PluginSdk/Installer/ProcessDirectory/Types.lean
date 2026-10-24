import PluginSdk.Compiler.Process.LauncherTypes

namespace PluginSdk.Installer.ProcessDirectory

open Compiler.Process

structure Input where
  root : String
  script : Launcher.Script

inductive Admission where
  | accepted (directory : String)
  | unresolved
  | tooLong (units : Nat)
  deriving DecidableEq

structure Interface where
  admit : Input → Admission

end PluginSdk.Installer.ProcessDirectory
