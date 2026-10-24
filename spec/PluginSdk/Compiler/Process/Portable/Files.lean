import Init.Data.String.Lemmas.Intercalate
import PluginSdk.Compiler.Process.Portable.Types

namespace PluginSdk.Compiler.Process.Portable

structure ProcessData where
  posix : PackagePath
  script : Launcher.Script
  deriving DecidableEq

inductive FilePlan where
  | runtime (path : PackagePath)
  | process (path : PackagePath) (data : ProcessData)
  | posix (path : PackagePath) (content : String)
  deriving DecidableEq

def FilePlan.path : FilePlan → PackagePath
  | .runtime path | .process path _ | .posix path _ => path

def runtimeFile : PackagePath :=
  ⟨".psdk/runtime/process.mjs", by
    refine ⟨".psdk", ["runtime", "process.mjs"], ?_, ?_, ?_, Or.inl (by decide)⟩
    · simp [String.intercalate_cons_cons]
    · unfold SafeSegment
      decide
    · intro segment member
      have member' : segment = "runtime" ∨ segment = "process.mjs" := by
        simpa using member
      rcases member' with rfl | rfl
      · unfold SafeSegment
        decide
      · unfold SafeSegment
        decide⟩

theorem runtimeFile_no_dollar :
    '$' ∉ runtimeFile.value.toList := by decide

theorem runtimeFile_value :
    runtimeFile.value = runtimePath := rfl

end PluginSdk.Compiler.Process.Portable
