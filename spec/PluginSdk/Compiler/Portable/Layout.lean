import PluginSdk.Compiler.Portable.Types
import PluginSdk.Compiler.Mcp.Portable.Model
import PluginSdk.Compiler.Hooks.Portable.Model

namespace PluginSdk.Compiler.Portable

def payload : FilePlan → Bool
  | .runtime _ => false
  | .process _ _ | .posix _ _ => true

def sharedFiles (mcp hooks : List FilePlan) : List FilePlan :=
  if mcp = [] ∧ hooks = [] then []
  else .runtime Process.Portable.runtimeFile :: ((mcp ++ hooks).filter payload)

def expectedFiles (input : Input) : List FilePlan :=
  sharedFiles (Mcp.Portable.files input.mcp) (Hooks.Portable.files (hookInput input))

def requiredIssues (input : Input) : List Issue :=
  (Mcp.Portable.requiredIssues input.mcp).map Issue.mcp ++
    (Hooks.Portable.requiredIssues (hookInput input)).map Issue.hook

def RequiredIssue (input : Input) : Issue → Prop
  | .mcp issue => Mcp.Portable.RequiredIssue input.mcp issue
  | .hook issue => Hooks.Portable.RequiredIssue (hookInput input) issue

def Representable (input : Input) : Prop :=
  Mcp.Portable.Representable input.mcp ∧ Hooks.Portable.Representable (hookInput input)

end PluginSdk.Compiler.Portable
