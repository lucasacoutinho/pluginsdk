import PluginSdk.Catalog.Wire
import PluginSdk.Installer.ProjectActivation.Model
import PluginSdk.WireJson

namespace PluginSdk.Installer.ProjectActivation.Wire

open Lean (Json)
open PluginSdk.WireJson

private instance (text : String) : Decidable (ValidSkillName text) := by
  unfold ValidSkillName
  infer_instance

private def readProcessText (json : Json) : Except String String := do
  let text ← json.getStr?
  unless !text.isEmpty && !text.toList.contains '\x00' do
    throw "expected nonempty Unicode process text without NUL"
  return text

private def readPluginId (json : Json) : Except String String :=
  PluginSdk.Catalog.Wire.readPluginId json

private def readMarketplace (json : Json) : Except String String := do
  let text ← json.getStr?
  let characters := text.toList
  unless characters.length == 34 && text.startsWith "pluginsdk-" &&
      (characters.drop 10).all ("0123456789abcdef".contains ·) do
    throw "expected a project marketplace name"
  return text

private def readRegistration (json : Json) : Except String Registration := do
  checkFields json ["plugin", "marketplace", "root"]
  return ⟨← readPluginId (← json.getObjVal? "plugin"),
    ← readMarketplace (← json.getObjVal? "marketplace"),
    ← readProcessText (← json.getObjVal? "root")⟩

private def readAgentName (json : Json) : Except String AgentName := do
  let text ← json.getStr?
  if valid : ValidSkillName text then return ⟨text, valid⟩
  else throw "expected a portable agent name"

private def readRoleName (json : Json) : Except String String :=
  readProcessText json

private def readConfigFile (json : Json) : Except String String :=
  readProcessText json

private def readBinding (json : Json) : Except String Binding := do
  checkFields json ["name", "configFile"]
  return ⟨← readRoleName (← json.getObjVal? "name"),
    ← readConfigFile (← json.getObjVal? "configFile")⟩

private def readPlatform (json : Json) : Except String Platform := do
  match ← json.getStr? with
  | "linux" => pure .linux
  | "win32" => pure .windows
  | value => throw s!"unsupported project platform: {value}"

private def readCacheVersion (json : Json) : Except String String := do
  let text ← readProcessText json
  unless text != "." && text != ".." && !text.toList.contains '/' &&
      !text.toList.contains '\\' do
    throw "expected one native cache version component"
  return text

private def readBuildInput (json : Json) : Except String BuildInput := do
  checkFields json ["platform", "home", "version", "registration", "agents"]
  return ⟨← readPlatform (← json.getObjVal? "platform"),
    ← readProcessText (← json.getObjVal? "home"),
    ← readCacheVersion (← json.getObjVal? "version"),
    ← readRegistration (← json.getObjVal? "registration"),
    ← (← (← json.getObjVal? "agents").getArr?).toList.mapM readAgentName⟩

private def readObservationSource (json : Json) : Except String Source := do
  match ← json.getStr? with
  | "managed" => pure .managed
  | "foreign" => pure .foreign
  | value => throw s!"unknown project role observation source: {value}"

private def readObservation (json : Json) : Except String Observation := do
  let tag ← (← json.getObjVal? "type").getStr?
  match tag with
  | "declared" => do
    checkFields json ["type", "source", "declaredName", "name", "configFile"]
    return .declared
      (← readObservationSource (← json.getObjVal? "source"))
      (← readRoleName (← json.getObjVal? "declaredName"))
      (← readRoleName (← json.getObjVal? "name"))
      (← readOptional readConfigFile (← json.getObjVal? "configFile"))
  | "discovered" => do
    checkFields json ["type", "name", "path"]
    return .discovered (← readRoleName (← json.getObjVal? "name"))
      (← readConfigFile (← json.getObjVal? "path"))
  | "unknown" => do
    checkFields json ["type"]
    return .unknown
  | value => throw s!"unknown project role observation: {value}"

private def readAuthorityInput (json : Json) : Except String AuthorityInput := do
  checkFields json ["previous", "desired", "observed"]
  return ⟨← (← (← json.getObjVal? "previous").getArr?).toList.mapM readBinding,
    ← (← (← json.getObjVal? "desired").getArr?).toList.mapM readBinding,
    ← (← (← json.getObjVal? "observed").getArr?).toList.mapM readObservation⟩

private def writeRegistration (registration : Registration) : Json := Json.mkObj [
  ("plugin", .str registration.plugin),
  ("marketplace", .str registration.marketplace),
  ("root", .str registration.root)
]

private def writeBinding (binding : Binding) : Json := Json.mkObj [
  ("name", .str binding.name),
  ("configFile", .str binding.configFile)
]

private def writeActivation (activation : Activation) : Json := Json.mkObj [
  ("registration", writeRegistration activation.registration),
  ("agents", .arr (activation.agents.map writeBinding).toArray)
]

private def writeCache (cache : Cache) : Json := Json.mkObj [
  ("directory", .str cache.directory),
  ("payload", .str cache.payload)
]

private def writeBuildResult : BuildResult → Json
  | .rendered cache activation => tagged "rendered" [
      ("cache", writeCache cache), ("activation", writeActivation activation)
    ]
  | .rejected duplicates => tagged "rejected" [
      ("duplicates", .arr (duplicates.toList.map fun name => .str name.value).toArray)
    ]

private def writeReason : Reason → String
  | .duplicate => "duplicate"
  | .unknown => "unknown"
  | .unowned => "unowned"
  | .drift => "drift"

private def writeAuthorityResult : AuthorityResult → Json
  | .ready => tagged "ready"
  | .blocked reason => tagged "blocked" [("reason", .str (writeReason reason))]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← (← request.getObjVal? "schema").getNum?
  unless schema.toFloat == (1.0 : Float) do throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "build_project_activation" => do
      let result := model.build (← readBuildInput input)
      pure (writeBuildResult result)
    | "review_project_role_authority" => do
      let result := model.review (← readAuthorityInput input)
      pure (writeAuthorityResult result)
    | value => throw s!"unknown project activation request: {value}"
  return Json.mkObj [("schema", 1), ("type", .str tag), ("output", output)]

end PluginSdk.Installer.ProjectActivation.Wire
