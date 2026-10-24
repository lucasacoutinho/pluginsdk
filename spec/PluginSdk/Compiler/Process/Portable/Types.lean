import PluginSdk.Compiler.Process.LauncherTypes

namespace PluginSdk.Compiler.Process.Portable

structure Input where
  host : Host
  path : PackagePath
  plan : Plan

inductive Issue where
  | environmentCollision (name : String)
  | environmentReferenceUnsupported (name : EnvironmentName)
  deriving DecidableEq

structure Program where
  script : Launcher.Script
  native : Launcher.Native
  posix : String
  deriving DecidableEq

inductive Result where
  | rendered (program : Program)
  | rejected (issues : NonemptyList Issue)

structure Interface where
  build : Input → Result
  compile : Plan → Launcher.Script

def runtimePath : String := ".psdk/runtime/process.mjs"

end PluginSdk.Compiler.Process.Portable
