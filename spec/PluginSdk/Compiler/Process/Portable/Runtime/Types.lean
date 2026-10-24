import PluginSdk.Compiler.Process.Portable.Captures

namespace PluginSdk.Compiler.Process.Portable.Runtime

structure Interface where
  read : EnvironmentName → Option String → Option String → Option String
  execute : Launcher.Script → String → (EnvironmentName → Option String) → Option Launcher.Invocation

end PluginSdk.Compiler.Process.Portable.Runtime
