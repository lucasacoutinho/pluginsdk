import PluginSdk.Compiler.Types

namespace PluginSdk.Compiler.Assembly

structure Input where
  base : NonemptyList Asset
  assets : List Asset

inductive Issue where
  | pathCollision (path : String)
  | reservedAsset (path : String)
  deriving DecidableEq, Repr

inductive Result where
  | assembled (files : NonemptyList Asset)
  | rejected (issues : NonemptyList Issue)

structure Interface where
  assemble : Input → Result

def reservedRoots : List String :=
  ["plugin.json", "mcp.json", ".mcp.json", ".lsp.json", ".claude-plugin", ".codex-plugin",
    ".claude", ".codex", "skills", "commands", "agents", "hooks"]

def ReservedPath (path : String) : Prop :=
  ∃ root, root ∈ reservedRoots ∧
    (asciiFold path = root ∨ (asciiFold path).startsWith (root ++ "/") = true)

instance (path : String) : Decidable (ReservedPath path) := by
  unfold ReservedPath
  infer_instance

def IssueKey : Issue → List String
  | .pathCollision path => ["path_collision", path]
  | .reservedAsset path => ["reserved_asset", path]

end PluginSdk.Compiler.Assembly
