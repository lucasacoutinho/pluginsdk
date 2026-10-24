import PluginSdk.Compiler.Generated
import PluginSdk.Compiler.Process.Launcher

namespace PluginSdk.Compiler.Mcp

open PluginSdk.Compiler
open PluginSdk.Compiler.Process

def hostFor : Format → Host
  | .agentPluginsV1 => .codex
  | .claudeCodeV1 => .claudeCode
  | .codexPluginV1 => .codex

def canonicalLocals (servers : List (String × Plan)) : List (String × Plan) :=
  ordered (fun server => [server.1]) servers

def indexedLocals (servers : List (String × Plan)) : List (Nat × (String × Plan)) :=
  Generated.enumerateFrom 0 (canonicalLocals servers)

abbrev launcherPath := Generated.launcherPath .mcp

theorem launcherPath_no_dollar (index : Nat) :
    '$' ∉ (launcherPath index).value.toList := Generated.launcherPath_no_dollar .mcp index

theorem launcherPath_value_injective {left right : Nat}
    (equal : (launcherPath left).value = (launcherPath right).value) : left = right :=
  Generated.launcherPath_value_injective .mcp equal

end PluginSdk.Compiler.Mcp
