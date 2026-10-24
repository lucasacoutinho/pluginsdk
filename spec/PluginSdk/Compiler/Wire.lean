import PluginSdk.Compiler.Model
import PluginSdk.WireJson

namespace PluginSdk.Compiler.Wire

open Lean (Json)
open WireJson

private instance (text : String) : Decidable (ValidSkillName text) := by unfold ValidSkillName; infer_instance

private def readSkillName (json : Json) : Except String SkillName := do
  let text ← json.getStr?
  if valid : ValidSkillName text then return ⟨text, valid⟩
  else throw "expected a lowercase skill name"

private def readNonempty (json : Json) : Except String String := do
  let text ← json.getStr?
  if text.isEmpty then throw "expected a nonempty string"
  return text

private def asciiLetter (c : Char) : Bool := ('a' ≤ c && c ≤ 'z') || ('A' ≤ c && c ≤ 'Z')
private def digit (c : Char) : Bool := '0' ≤ c && c ≤ '9'

private def readPluginId (json : Json) : Except String String := do
  let text ← readNonempty json
  let chars := text.toList
  unless text.length ≤ 64 && chars.all (fun c => ('a' ≤ c && c ≤ 'z') || digit c || c == '.' || c == '-') &&
      (chars.head?.any fun c => c != '.' && c != '-') && (chars.getLast?.any fun c => c != '.' && c != '-') &&
      !['-', '-'].isInfixOf_internal text.toList && !['.', '.'].isInfixOf_internal text.toList do
    throw "expected a plugin ID"
  return text

private def readCaptured (json : Json) : Except String CapturedFile := do
  checkFields json ["digest", "executable"]
  return ⟨⟨← readHex (← json.getObjVal? "digest")⟩, ← (← json.getObjVal? "executable").getBool?⟩

private def readAsset (json : Json) : Except String Asset := do
  checkFields json ["path", "digest", "executable"]
  return ⟨← readPackagePath (← json.getObjVal? "path"),
    ⟨⟨← readHex (← json.getObjVal? "digest")⟩, ← (← json.getObjVal? "executable").getBool?⟩⟩

private def readSkill (json : Json) : Except String Skill := do
  checkFields json ["name", "entry", "assets"]
  return ⟨← readSkillName (← json.getObjVal? "name"), ← readCaptured (← json.getObjVal? "entry"),
    ← (← (← json.getObjVal? "assets").getArr?).toList.mapM readAsset⟩

private def readHeaderText (json : Json) : Except String String := do
  let text ← json.getStr?
  unless text.toList.all (fun c => c == '\t' || (32 ≤ c.toNat && c.toNat ≤ 126) || (128 ≤ c.toNat && c.toNat ≤ 255)) do
    throw "expected an HTTP header value"
  return text

private def readEnvironmentName (json : Json) : Except String String := do
  let text ← readNonempty json
  unless (text.toList.head?.any fun c => asciiLetter c || c == '_') &&
      text.toList.all (fun c => asciiLetter c || digit c || c == '_') do
    throw "expected an environment variable name"
  return text

private def readHeader (json : Json) : Except String HeaderValue := do
  match json with
  | .str _ => .literal <$> readHeaderText json
  | _ =>
    checkFields json ["type", "name", "prefix"]
    unless (← (← json.getObjVal? "type").getStr?) == "environment" do throw "expected an environment reference"
    return .environment (← readEnvironmentName (← json.getObjVal? "name")) (← readHeaderText (← json.getObjVal? "prefix"))

def readServer (json : Json) : Except String RemoteMcp := do
  checkFields json ["url", "headers"]
  let headers ← (← (← json.getObjVal? "headers").getObj?).toList.mapM fun (name, value) => do
    unless !name.isEmpty && name.toList.all (fun c => asciiLetter c || digit c || "!#$%&'*+.^_`|~-".contains c) do
      throw "expected an HTTP header name"
    return (name, ← readHeader value)
  return ⟨← (← json.getObjVal? "url").getStr?, headers⟩

private def readInput (json : Json) : Except String RenderInput := do
  checkFields json ["format", "metadata", "skills", "mcp"]
  let format ← match ← (← json.getObjVal? "format").getStr? with
    | "agent_plugins_v1" => pure Format.agentPluginsV1
    | "claude_code_v1" => pure Format.claudeCodeV1
    | "codex_plugin_v1" => pure Format.codexPluginV1
    | tag => throw s!"unsupported format: {tag}"
  let metadata ← json.getObjVal? "metadata"
  checkFields metadata ["id", "version", "description"]
  let servers ← (← (← json.getObjVal? "mcp").getObj?).toList.mapM fun (name, server) => do
    if name.isEmpty then throw "expected a nonempty MCP name"
    return (name, ← readServer server)
  return ⟨format, ⟨← readPluginId (← metadata.getObjVal? "id"), ← readNonempty (← metadata.getObjVal? "version"),
    ← readNonempty (← metadata.getObjVal? "description")⟩,
    ← (← (← json.getObjVal? "skills").getArr?).toList.mapM readSkill, servers⟩

private def writeFile : RenderedFile → Json
  | .copy path captured => tagged "copy"
    [("path", .str path.value), ("digest", .str captured.digest.value), ("executable", .bool captured.executable)]
  | .json path value => tagged "json" [("path", .str path.value), ("value", value.value)]

private def writeProblem : McpProblem → Json
  | .environmentReference header => tagged "environment_reference" [("header", .str header)]
  | .literalExpansion header => tagged "literal_expansion" [("header", .str header)]
  | .headerCollision header => tagged "header_collision" [("header", .str header)]

private def writeIssue : RenderIssue → Json
  | .pathCollision path => tagged "path_collision" [("path", .str path)]
  | .unsupportedMcp server reason => tagged "unsupported_mcp" [("server", .str server), ("reason", writeProblem reason)]

private def writeOutput : RenderResult → Json
  | .rendered files => tagged "rendered" [("files", .arr (files.toList.map writeFile).toArray)]
  | .rejected issues => tagged "rejected" [("issues", .arr (issues.toList.map writeIssue).toArray)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  unless (← (← request.getObjVal? "type").getStr?) == "render" do throw "expected a render request"
  let output ← (fun input => writeOutput (model.render input)) <$> readInput (← request.getObjVal? "input")
  return Json.mkObj [("schema", 1), ("type", .str "render"), ("output", output)]

end PluginSdk.Compiler.Wire
