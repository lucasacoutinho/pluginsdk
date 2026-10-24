import PluginSdk.Installer.LauncherRuntime.Model
import PluginSdk.Catalog.Wire

namespace PluginSdk.Installer.LauncherRuntime.Wire

open Lean (Json)
open WireJson

private def readNatural (json : Json) : Except String Nat := do
  let value := (← json.getNum?).toFloat
  unless value.isFinite && value >= (0.0 : Float) && value <= (9007199254740991.0 : Float) &&
      value.toUInt64.toFloat == value do
    throw "expected a nonnegative safe integer"
  return value.toUInt64.toNat

private def readKind (json : Json) : Except String Kind := do
  match ← (← json.getObjVal? "type").getStr? with
  | "absent" => checkFields json ["type"]; return .absent
  | "posix" =>
    checkFields json ["type", "cwdRoot"]
    return .posix (← (← json.getObjVal? "cwdRoot").getBool?)
  | "portable" => checkFields json ["type"]; return .portable
  | value => throw s!"unknown launcher kind: {value}"

private def writeCheck : Check → Json
  | .node => .str "node"
  | .shell => .str "shell"
  | .env => .str "env"
  | .pwd => .str "pwd"

private def requirements (input : Json) : Except String Json := do
  checkFields input ["platform", "kind"]
  let result := model.requirements ⟨← Catalog.Wire.readNonempty (← input.getObjVal? "platform"),
    ← readKind (← input.getObjVal? "kind")⟩
  return writeOptional (fun checks => .arr (checks.map writeCheck).toArray) result

private def acceptsNode (input : Json) : Except String Json := do
  checkFields input ["platform", "major", "minor", "execve"]
  return .bool (model.acceptsNode ⟨← Catalog.Wire.readNonempty (← input.getObjVal? "platform"),
    ← readNatural (← input.getObjVal? "major"), ← readNatural (← input.getObjVal? "minor"),
    ← (← input.getObjVal? "execve").getBool?⟩)

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  unless (← (← request.getObjVal? "schema").getNum?).toFloat == (1.0 : Float) do
    throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "launcher_runtime_checks" => requirements input
    | "accept_node_runtime" => acceptsNode input
    | value => throw s!"unknown launcher runtime operation: {value}"
  return Json.mkObj [("schema", 1), ("type", .str tag), ("output", output)]

end PluginSdk.Installer.LauncherRuntime.Wire
