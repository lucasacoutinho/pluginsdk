import Init.Data.String.Lemmas.Intercalate
import PluginSdk.Compiler.Format

namespace PluginSdk.Compiler

theorem skill_segment_safe (name : SkillName) : SafeSegment name.value := by
  have chars := name.valid.2.2.1
  refine ⟨?_, ?_, ?_, ?_⟩
  · intro empty
    have lower := name.valid.1
    simp [empty] at lower
  · intro dot
    have bad := chars '.' (by simp [dot])
    simp at bad
  · intro dots
    have bad := chars '.' (by simp [dots])
    simp at bad
  · intro c member
    have allowed := chars c member
    refine ⟨?_, ?_, ?_⟩
    all_goals intro equal; subst c; simp at allowed

def packageFile (name : String) (safe : SafeSegment name) (drive : NoDrive name) : PackagePath :=
  ⟨name, name, [], rfl, safe, by simp, drive⟩

def manifestFile : Format → PackagePath
  | .claudeCode =>
    ⟨".claude-plugin/plugin.json", ".claude-plugin", ["plugin.json"], rfl,
      by unfold SafeSegment; decide,
      by simp; unfold SafeSegment; decide,
      by exact Or.inl (by decide)⟩

  | .codex =>
    ⟨".codex-plugin/plugin.json", ".codex-plugin", ["plugin.json"], rfl,
      by unfold SafeSegment; decide,
      by simp; unfold SafeSegment; decide,
      by exact Or.inl (by decide)⟩

def mcpFile : Format → PackagePath
  | .claudeCode | .codex => packageFile ".mcp.json" (by unfold SafeSegment; decide) (by exact Or.inl (by decide))

theorem manifestFile_value (format : Format) : (manifestFile format).value = manifestPath format := by
  cases format <;> rfl

theorem mcpFile_value (format : Format) : (mcpFile format).value = mcpPath format := by
  cases format <;> rfl

def skillEntry : PackagePath :=
  packageFile "SKILL.md" (by unfold SafeSegment; decide) (by exact Or.inl (by decide))

def withinSkill (name : SkillName) (relative : PackagePath) : PackagePath :=
  ⟨"skills/" ++ name.value ++ "/" ++ relative.value, by
    obtain ⟨first, rest, joined, headSafe, restSafe, _⟩ := relative.contained
    refine ⟨"skills", name.value :: first :: rest, ?_, ?_, ?_, ?_⟩
    · simp only [String.intercalate_cons_cons, ← joined]
      rw [show "skills/" = "skills" ++ "/" from by decide]
      simp only [String.append_assoc]
    · unfold SafeSegment; decide
    · intro segment member
      simp only [List.mem_cons] at member
      rcases member with rfl | rfl | member
      · exact skill_segment_safe name
      · exact headSafe
      · exact restSafe segment member
    · exact Or.inl (by decide)⟩

end PluginSdk.Compiler
