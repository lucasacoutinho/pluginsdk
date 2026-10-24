import PluginSdk.Compiler.Agents.Types
import PluginSdk.Compiler.Paths

namespace PluginSdk.Compiler.Agents

open Lean
open PluginSdk.Compiler
open PluginSdk.Compiler.Process

def nameKey (name : Name) : Key := [name.value]

def repeatedNameCandidates (input : Input) : List Name :=
  (input.agents.map Agent.name).filter fun name =>
    decide (1 < input.agents.countP (fun agent => agent.name == name))

def duplicateNames (input : Input) : List Name :=
  ordered nameKey (unique (repeatedNameCandidates input))

def failedIssues (input : Input) : List Issue :=
  (duplicateNames input).map Issue.duplicateAgent

def canonicalAgents (input : Input) : List Agent := ordered AgentKey input.agents

private theorem name_segment_safe (name : Name) : SafeSegment name.value :=
  skill_segment_safe ⟨name.value, name.valid⟩

private theorem file_segment_safe (name : Name) (extension : String)
    (validExtension : extension = ".md" ∨ extension = ".toml") :
    SafeSegment (name.value ++ extension) := by
  have nameSafe := name_segment_safe name
  refine ⟨?_, ?_, ?_, ?_⟩
  · intro empty
    have listEq := congrArg String.toList empty
    simp only [String.toList_append, String.toList_empty] at listEq
    have ⟨nameEmpty, _⟩ := List.append_eq_nil_iff.mp listEq
    exact nameSafe.1 (String.toList_inj.mp nameEmpty)
  · intro dot
    have lengthEq : name.value.length + extension.length = ".".length := by
      simpa only [String.length_append] using congrArg String.length dot
    have extensionLonger : ".".length < extension.length := by
      rcases validExtension with extensionEq | extensionEq <;> rw [extensionEq] <;> decide
    omega
  · intro dots
    have lengthEq : name.value.length + extension.length = "..".length := by
      simpa only [String.length_append] using congrArg String.length dots
    have extensionLonger : "..".length < extension.length := by
      rcases validExtension with extensionEq | extensionEq <;> rw [extensionEq] <;> decide
    omega
  · intro character member
    have member' : character ∈ name.value.toList ++ extension.toList := by
      simpa only [String.toList_append] using member
    rcases List.mem_append.mp member' with inName | inExtension
    · exact nameSafe.2.2.2 character inName
    · rcases validExtension with extensionEq | extensionEq
      · subst extension
        simp at inExtension
        rcases inExtension with rfl | rfl | rfl
        all_goals simp
      · subst extension
        simp at inExtension
        rcases inExtension with rfl | rfl | rfl | rfl | rfl
        all_goals simp

def agentPath (host : Host) (name : Name) : PackagePath :=
  ⟨PathValue host name, by
    refine ⟨"agents", [name.value ++ Extension host], ?_, ?_, ?_, ?_⟩
    · simp [PathValue, String.append_assoc, String.intercalate_cons_cons]
    · unfold SafeSegment
      decide
    · intro segment member
      simp only [List.mem_singleton] at member
      subst segment
      exact file_segment_safe name (Extension host) (by cases host <;> simp [Extension])
    · exact Or.inl (by decide)⟩

def renderEntry (input : Input) (agent : Agent) : Entry :=
  ⟨agent.name, Qualified input.plugin agent.name, agentPath input.host agent.name,
    object (DocumentRows input.host input.plugin agent), PromptValue input.host agent⟩

def canonicalEntries (input : Input) : List Entry :=
  (canonicalAgents input).map (renderEntry input)

def render (input : Input) : Result :=
  match failedIssues input with
  | [] => .rendered (canonicalEntries input)
  | issue :: rest => .rejected ⟨issue, rest⟩

def model : Interface := ⟨render⟩

end PluginSdk.Compiler.Agents
