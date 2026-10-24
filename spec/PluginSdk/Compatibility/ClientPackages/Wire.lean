import Lean.Data.Json
import PluginSdk.Compatibility.ClientPackages.Model
import PluginSdk.WireJson

namespace PluginSdk.Compatibility.ClientPackages.Wire

open Lean (Json toJson)
open PluginSdk.WireJson

private def readClient (json : Json) : Except String Client := do
  match ← json.getStr? with
  | "claude_code" => return .claudeCode
  | "codex" => return .codex
  | "cursor" => return .cursor
  | value => throw s!"unknown managed client: {value}"

private def readBuildInput (json : Json) : Except String BuildInput := do
  let clients ← (← json.getArr?).toList.mapM readClient
  match clients with
  | [] => throw "expected a nonempty managed-client array"
  | head :: tail => return ⟨head, tail⟩

private def writePackageClient (client : PackageClient) : Json :=
  match client with
  | .claudeCode => .str "claude_code"
  | .codex => .str "codex"

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  unless (← readUInt32 (← request.getObjVal? "schema")) == 1 do
    throw "unsupported schema version"
  let operation ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  match operation with
  | "client_package_host" =>
    checkFields input ["client"]
    let client ← readClient (← input.getObjVal? "client")
    let output := writePackageClient (model.packageClient client)
    return Json.mkObj [
      ("schema", toJson (1 : Nat)),
      ("type", .str "client_package_host"),
      ("output", output)]
  | "normalize_build_clients" =>
    checkFields input ["clients"]
    let clients ← readBuildInput (← input.getObjVal? "clients")
    let output := (model.buildClients clients).toList.map writePackageClient
    return Json.mkObj [
      ("schema", toJson (1 : Nat)),
      ("type", .str "normalize_build_clients"),
      ("output", .arr output.toArray)]
  | _ => throw s!"unknown client-package request: {operation}"

end PluginSdk.Compatibility.ClientPackages.Wire
