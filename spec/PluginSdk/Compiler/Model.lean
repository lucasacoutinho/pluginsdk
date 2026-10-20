import PluginSdk.Compiler.Collisions
import PluginSdk.Compiler.Headers
import PluginSdk.Compiler.Json

namespace PluginSdk.Compiler

def skillCopies (skill : Skill) : List RenderedFile :=
  .copy (withinSkill skill.name skillEntry) skill.entry ::
    skill.assets.map fun asset => .copy (withinSkill skill.name asset.path) asset.file

def rawFiles (input : RenderInput) : List RenderedFile :=
  manifest input :: ((if input.mcp = [] then [] else [mcp input]) ++ input.skills.flatMap skillCopies)

def fileKey (file : RenderedFile) : Key := [file.path.value]

def files (input : RenderInput) : List RenderedFile := ordered fileKey (rawFiles input)

def issues (input : RenderInput) : List RenderIssue :=
  ordered IssueKey (unique ((pathCollisions (requestedPaths input)).map .pathCollision ++ mcpIssues input))

def render (input : RenderInput) : RenderResult :=
  match issues input with
  | [] => .rendered (nonempty (files input) (by
      intro empty
      have sameLength := (ordered_perm fileKey (rawFiles input)).length_eq
      simp only [files] at empty
      rw [empty] at sameLength
      simp [rawFiles] at sameLength))
  | head :: tail => .rejected ⟨head, tail⟩

def model : Interface := ⟨render⟩

end PluginSdk.Compiler
