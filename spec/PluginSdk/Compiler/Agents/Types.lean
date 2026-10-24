import PluginSdk.Compiler.Canonical
import PluginSdk.Compiler.Json
import PluginSdk.Compiler.Process.Types

namespace PluginSdk.Compiler.Agents

open Lean
open PluginSdk.Compiler.Process

structure Name where
  value : String
  valid : ValidSkillName value
  deriving DecidableEq

inductive Shell where
  | hostDefault
  | deny
  deriving DecidableEq, Repr

structure Agent where
  name : Name
  description : String
  prompt : String
  model : Option String
  shell : Shell
  deriving DecidableEq

structure Input where
  host : Host
  plugin : String
  agents : List Agent

structure Entry where
  name : Name
  qualified : String
  path : PackagePath
  document : JsonObject
  prompt : Option String

inductive Issue where
  | duplicateAgent (name : Name)
  deriving DecidableEq

inductive Result where
  | rendered (entries : List Entry)
  | rejected (issues : NonemptyList Issue)

structure Interface where
  render : Input → Result

def NamesUnique (input : Input) : Prop := (input.agents.map (·.name)).Nodup

def Qualified (plugin : String) (name : Name) : String := plugin ++ ":" ++ name.value

def AgentKey (agent : Agent) : Key := [agent.name.value]

def IssueKey : Issue → Key
  | .duplicateAgent name => [name.value]

def RequiredIssue (input : Input) : Issue → Prop
  | .duplicateAgent name => 1 < input.agents.countP (fun agent => agent.name == name)

def Extension : Host → String
  | .claudeCode => ".md"
  | .codex => ".toml"

def PathValue (host : Host) (name : Name) : String := "agents/" ++ name.value ++ Extension host

def DocumentRows (host : Host) (plugin : String) (agent : Agent) : List (String × Json) :=
  [("name", .str (match host with | .claudeCode => agent.name.value | .codex => Qualified plugin agent.name)),
    ("description", .str agent.description)] ++
  (match host with | .claudeCode => [] | .codex => [("developer_instructions", .str agent.prompt)]) ++
  (match agent.model with | none => [] | some model => [("model", .str model)]) ++
  (match agent.shell, host with
    | .hostDefault, _ => []
    | .deny, .claudeCode => [("disallowedTools", .arr #[.str "Bash"])]
    | .deny, .codex => [("features", (object [("shell_tool", .bool false)]).value)])

def PromptValue (host : Host) (agent : Agent) : Option String :=
  match host with | .claudeCode => some agent.prompt | .codex => none

def Matches (input : Input) (agent : Agent) (entry : Entry) : Prop :=
  entry.name = agent.name ∧ entry.qualified = Qualified input.plugin agent.name ∧
  entry.path.value = PathValue input.host agent.name ∧
  entry.document = object (DocumentRows input.host input.plugin agent) ∧
  entry.prompt = PromptValue input.host agent

end PluginSdk.Compiler.Agents
