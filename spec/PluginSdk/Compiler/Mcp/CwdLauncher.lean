import PluginSdk.Compiler.Process.Launcher

namespace PluginSdk.Compiler.Mcp.CwdLauncher

open PluginSdk.Compiler.Process

def rootPrelude : String :=
  "set -- \"$(/bin/pwd -P && printf .)\"\n" ++
  "[ \"${1%.}\" != \"$1\" ]\n" ++
  "set -- \"${1%.}\"\n" ++
  "set -- \"${1%?}\"\n"

def readRoot (framed : String) : Option String :=
  match framed.toList.reverse with
  | '.' :: '\n' :: reversed => some (String.ofList reversed.reverse)
  | _ => none

def serialize (script : Launcher.Script) : String :=
  Launcher.header ++ rootPrelude ++ Launcher.serializeBody script

def native (path : PackagePath) (script : Launcher.Script) : Option Launcher.Native :=
  if script.captures = [] then some ⟨"/bin/sh", [path.value], [], some "."⟩ else none

end PluginSdk.Compiler.Mcp.CwdLauncher
