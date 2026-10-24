import PluginSdk.Compiler.Generated
import PluginSdk.Compiler.Process.Types

namespace PluginSdk.Compiler.Hooks.Binding

structure Input where
  host : Process.Host
  ordinal : Nat
  deriving DecidableEq

inductive Native where
  | direct (command : String) (args : List String)
  | shell (command : String)
  deriving DecidableEq

structure Output where
  path : PackagePath
  native : Native
  deriving DecidableEq

structure Interface where
  bind : Input → Output

abbrev dataPath := Generated.dataPath .hooks

def codexBootstrap : String :=
  "node --input-type=commonjs -e \"const p=require('node:path'),u=require('node:url'),r=process.env.PLUGIN_ROOT,e=p.join(r,'.psdk/runtime/process.mjs');process.argv.splice(1,0,e,r);import(u.pathToFileURL(e).href)\" -- "

end PluginSdk.Compiler.Hooks.Binding
