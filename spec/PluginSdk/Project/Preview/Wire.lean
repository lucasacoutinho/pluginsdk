import Lean.Data.Json
import PluginSdk.Project.Preview.Model
import PluginSdk.WireJson

namespace PluginSdk.Project.Preview.Wire

open Lean (Json toJson)
open PluginSdk.WireJson

private def readClient (json : Json) : Except String Client := do
  match ← json.getStr? with
  | "claude_code" => return .claudeCode
  | "codex" => return .codex
  | "cursor" => return .cursor
  | value => throw s!"unknown preview client: {value}"

private def writeClient : Client → Json
  | .claudeCode => .str "claude_code"
  | .codex => .str "codex"
  | .cursor => .str "cursor"

private def readDesired (json : Json) : Except String Desired := do
  match ← json.getStr? with
  | "present" => return .present
  | "absent" => return .absent
  | value => throw s!"unknown preview desire: {value}"

private def writeDesired : Desired → Json
  | .present => .str "present"
  | .absent => .str "absent"

private def readProvider (json : Json) : Except String Provider := do
  match ← json.getStr? with
  | "none" => return .none
  | "qualified" => return .qualified
  | "unqualified" => return .unqualified
  | value => throw s!"unknown preview provider evidence: {value}"

private def readStatus (json : Json) : Except String LocalStatus := do
  match ← json.getStr? with
  | "missing" => return .missing
  | "unchanged" => return .unchanged
  | "installed" => return .installed
  | "removed" => return .removed
  | "not_applied" => return .notApplied
  | "uncertain" => return .uncertain
  | value => throw s!"unknown local preview status: {value}"

private def writeCompletion : Completion → Json
  | .missing => .str "missing"
  | .unchanged => .str "unchanged"
  | .installed => .str "installed"
  | .removed => .str "removed"
  | .notApplied => .str "not_applied"
  | .uncertain => .str "uncertain"
  | .inherited => .str "inherited"

private def writeRoute : Route → Json
  | .direct client desired => Json.mkObj [
      ("type", .str "direct"), ("client", writeClient client), ("desired", writeDesired desired)]
  | .inherited => Json.mkObj [
      ("type", .str "inherited"), ("client", .str "cursor"),
      ("provider", .str "claude_code"), ("desired", .str "absent")]
  | .blocked => Json.mkObj [
      ("type", .str "blocked"), ("client", .str "cursor"), ("reason", .str "import_unsupported")]

private def readCompletionInput (json : Json) : Except String CompletionInput := do
  match ← (← json.getObjVal? "type").getStr? with
  | "direct" =>
    checkFields json ["type", "status"]
    return .direct (← readStatus (← json.getObjVal? "status"))
  | "inherited" =>
    checkFields json ["type", "provider", "local"]
    return .inherited (← readStatus (← json.getObjVal? "provider"))
      (← readStatus (← json.getObjVal? "local"))
  | value => throw s!"unknown preview completion input: {value}"

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  unless (← readUInt32 (← request.getObjVal? "schema")) == 1 do
    throw "unsupported schema version"
  let operation ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match operation with
    | "preview_route" => do
      checkFields input ["client", "desired", "provider"]
      let parsed : RouteInput := ⟨
        ← readClient (← input.getObjVal? "client"),
        ← readDesired (← input.getObjVal? "desired"),
        ← readProvider (← input.getObjVal? "provider")⟩
      pure (writeRoute (model.route parsed))
    | "preview_apply" => do
      checkFields input ["provider"]
      pure (toJson (model.mayApplyInherited (← readStatus (← input.getObjVal? "provider"))))
    | "preview_finish" => do
      pure (writeCompletion (model.finish (← readCompletionInput input)))
    | _ => throw s!"unknown preview routing request: {operation}"
  return Json.mkObj [("schema", toJson (1 : Nat)), ("type", .str operation), ("output", output)]

end PluginSdk.Project.Preview.Wire
