import PluginSdk.Catalog.Tools.Model
import PluginSdk.Catalog.Wire
import PluginSdk.WireJson

namespace PluginSdk.Catalog.Tools.Wire

open Lean (Json)
open WireJson

private def readToolName (json : Json) : Except String Authorization.ToolName := do
  return ⟨← Catalog.Wire.readNonempty json⟩

private def readToolMetadataDigest (json : Json) : Except String ToolMetadataDigest := do
  return ⟨← readHex json⟩

private def readDescriptor (json : Json) : Except String ToolDescriptor := do
  checkFields json ["name", "digest"]
  return ⟨← readToolName (← json.getObjVal? "name"),
    ← readToolMetadataDigest (← json.getObjVal? "digest")⟩

private def readNormalizeInput (json : Json) : Except String (List ToolDescriptor) := do
  checkFields json ["tools"]
  let tools ← (← json.getObjVal? "tools").getArr?
  return ← tools.toList.mapM readDescriptor

private def readContractIdentity (json : Json) : Except String ContractIdentity := do
  checkFields json ["organization", "service", "digest"]
  let organization ← Catalog.Wire.readNonempty (← json.getObjVal? "organization")
  let service ← Catalog.Wire.readNonempty (← json.getObjVal? "service")
  let digest ← readHex (← json.getObjVal? "digest")
  return ⟨⟨organization⟩, ⟨service⟩, ⟨digest⟩⟩

private def readBindingInput (json : Json) : Except String BindingInput := do
  checkFields json ["expected", "actual"]
  return ⟨← readContractIdentity (← json.getObjVal? "expected"),
    ← readContractIdentity (← json.getObjVal? "actual")⟩

private def writeDescriptor (descriptor : ToolDescriptor) : Json := Json.mkObj [
  ("name", .str descriptor.name.value),
  ("digest", .str descriptor.digest.value)
]

private def writeToolResult : ToolResult → Json
  | .accepted tools => tagged "accepted" [
      ("tools", .arr (tools.map writeDescriptor).toArray)
    ]
  | .rejected tools => tagged "rejected" [
      ("tools", .arr (tools.toList.map fun name => .str name.value).toArray)
    ]

private def writeBindingIssue : BindingIssue → Json
  | .digestMismatch => .str "digest_mismatch"
  | .organizationMismatch => .str "organization_mismatch"
  | .serviceMismatch => .str "service_mismatch"

private def writeBindingResult : BindingResult → Json
  | .accepted => tagged "accepted"
  | .rejected issues => tagged "rejected" [
      ("issues", .arr (issues.toList.map writeBindingIssue).toArray)
    ]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← (← request.getObjVal? "schema").getNum?
  unless schema.toFloat == (1.0 : Float) do throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "normalize_tools" => do
      let tools ← readNormalizeInput input
      pure (writeToolResult (model.normalize tools))
    | "check_contract_binding" => do
      let binding ← readBindingInput input
      pure (writeBindingResult (model.bind binding))
    | value => throw s!"unknown tool-contract request: {value}"
  return Json.mkObj [
    ("schema", 1),
    ("type", .str tag),
    ("output", output)
  ]

end PluginSdk.Catalog.Tools.Wire
