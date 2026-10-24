import PluginSdk.Compatibility.Model
import PluginSdk.Catalog.Wire
import PluginSdk.Catalog.Artifacts.Types

namespace PluginSdk.Compatibility.Wire

open Lean (Json)
open WireJson

private def readHost (json : Json) : Except String Host := do
  match ← json.getStr? with
  | "claude_code" => return .claudeCode
  | "codex" => return .codex
  | "cursor" => return .cursor
  | "grok_bot" => return .grokBot
  | "muse" => return .muse
  | value => throw s!"unknown host: {value}"

private def writeHost : Host → Json
  | .claudeCode => .str "claude_code"
  | .codex => .str "codex"
  | .cursor => .str "cursor"
  | .grokBot => .str "grok_bot"
  | .muse => .str "muse"

private def readScope (json : Json) : Except String Scope := do
  match ← json.getStr? with
  | "user" => return .user
  | "project" => return .project
  | value => throw s!"unknown scope: {value}"

private def writeScope : Scope → Json
  | .user => .str "user"
  | .project => .str "project"

private def readCapability (json : Json) : Except String Capability := do
  match ← json.getStr? with
  | "stdio" => return .stdio
  | "hooks" => return .hooks
  | "agents" => return .agents
  | value => throw s!"unknown capability: {value}"

private def writeCapability : Capability → Json
  | .stdio => .str "stdio"
  | .hooks => .str "hooks"
  | .agents => .str "agents"

private def readIdentityFields (json : Json) : Except String ProfileIdentity := do
  return ⟨← readHost (← json.getObjVal? "host"),
    ⟨← Catalog.Wire.readNonempty (← json.getObjVal? "platform")⟩,
    ← readScope (← json.getObjVal? "scope"),
    ⟨← Catalog.Wire.readNonempty (← json.getObjVal? "revision")⟩⟩

private def readIdentity (json : Json) : Except String ProfileIdentity := do
  checkFields json ["host", "platform", "scope", "revision"]
  readIdentityFields json

private def readProfile (json : Json) : Except String NativeProfile := do
  checkFields json ["host", "platform", "scope", "revision", "format", "capabilities"]
  let capabilities ← (← (← json.getObjVal? "capabilities").getArr?).toList.mapM readCapability
  return ⟨← readIdentityFields json,
    ← Catalog.Wire.readPackageFormat (← json.getObjVal? "format"), capabilities⟩

private def writeProfile (profile : NativeProfile) : Json := Json.mkObj [
  ("host", writeHost profile.identity.host),
  ("platform", .str profile.identity.platform.value),
  ("scope", writeScope profile.identity.scope),
  ("revision", .str profile.identity.revision.value),
  ("format", .str (Catalog.Wire.writePackageFormat profile.format)),
  ("capabilities", .arr (profile.capabilities.map writeCapability).toArray)
]

private def readQuery (json : Json) : Except String ProfileQuery := do
  checkFields json ["host", "platform", "scope", "format", "requirements"]
  let requirements ← (← (← json.getObjVal? "requirements").getArr?).toList.mapM readCapability
  return ⟨← readHost (← json.getObjVal? "host"),
    ⟨← Catalog.Wire.readNonempty (← json.getObjVal? "platform")⟩,
    ← readScope (← json.getObjVal? "scope"),
    ← readOptional Catalog.Wire.readPackageFormat (← json.getObjVal? "format"), requirements⟩

private def readSelectionInput (json : Json) : Except String SelectionInput := do
  checkFields json ["query", "profiles"]
  return ⟨← readQuery (← json.getObjVal? "query"),
    ← (← (← json.getObjVal? "profiles").getArr?).toList.mapM readProfile⟩

private def readOwnershipInput (json : Json) : Except String OwnershipInput := do
  checkFields json ["current", "retained", "profiles"]
  return ⟨← readIdentity (← json.getObjVal? "current"), ← readIdentity (← json.getObjVal? "retained"),
    ← (← (← json.getObjVal? "profiles").getArr?).toList.mapM readProfile⟩

private def writeSelection : Selection → Json
  | .selected profile => tagged "selected" [("profile", writeProfile profile)]
  | .unqualified => tagged "blocked" [("reason", .str "unqualified")]
  | .ambiguous => tagged "blocked" [("reason", .str "ambiguous")]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← (← request.getObjVal? "schema").getNum?
  unless schema.toFloat == (1.0 : Float) do throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "select_native_profile" => do
      pure (writeSelection (model.select (← readSelectionInput input)))
    | "native_ownership_compatible" => do
      pure (.bool (model.ownershipCompatible (← readOwnershipInput input)))
    | value => throw s!"unknown native compatibility operation: {value}"
  return Json.mkObj [("schema", 1), ("type", .str tag), ("output", output)]

end PluginSdk.Compatibility.Wire
