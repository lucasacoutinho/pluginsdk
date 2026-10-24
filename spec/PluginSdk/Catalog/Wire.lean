import PluginSdk.Catalog.Model
import PluginSdk.WireJson

namespace PluginSdk.Catalog.Wire

open Lean (Json)
open WireJson

def readNonempty (json : Json) : Except String String := do
  let value ← json.getStr?
  if value.isEmpty then throw "expected a nonempty string"
  return value

def readPluginId (json : Json) : Except String String := do
  let text ← readNonempty json
  let chars := text.toList
  unless text.length ≤ 64 && chars.all (fun c => ('a' ≤ c && c ≤ 'z') || ('0' ≤ c && c ≤ '9') || c == '.' || c == '-') &&
      (chars.head?.any fun c => c != '.' && c != '-') && (chars.getLast?.any fun c => c != '.' && c != '-') &&
      !['-', '-'].isInfixOf_internal text.toList && !['.', '.'].isInfixOf_internal text.toList do
    throw "expected a plugin ID"
  return text

private def readCommit (json : Json) : Except String String := do
  let text ← json.getStr?
  unless (text.length == 40 || text.length == 64) &&
      text.toList.all ("0123456789abcdef".contains ·) do
    throw "expected a lowercase 40- or 64-digit hexadecimal commit"
  return text

private def readReleaseKey (json : Json) : Except String ReleaseKey := do
  checkFields json ["organization", "integration", "release"]
  return ⟨⟨← readNonempty (← json.getObjVal? "organization")⟩,
    ⟨← readNonempty (← json.getObjVal? "integration")⟩,
    ⟨← readNonempty (← json.getObjVal? "release")⟩⟩

private def readOriginPath (json : Json) : Except String String := do
  let text ← json.getStr?
  if text == "." then return text
  return (← readPackagePath json).value

private def readReleaseOrigin (json : Json) : Except String ReleaseOrigin := do
  match ← (← json.getObjVal? "type").getStr? with
  | "repository" =>
    checkFields json ["type", "repository", "commit", "path"]
    return .repository (← readNonempty (← json.getObjVal? "repository"))
      (← readCommit (← json.getObjVal? "commit"))
      (← readOriginPath (← json.getObjVal? "path"))
  | "artifact" =>
    checkFields json ["type", "location", "digest"]
    return .artifact (← readNonempty (← json.getObjVal? "location"))
      (← readHex (← json.getObjVal? "digest"))
  | tag => throw s!"unknown release origin: {tag}"

def readPackageDigests (json : Json) : Except String FormatDigests := do
  let fields ← json.getObj?
  let keys := fields.toList.map Prod.fst
  let allowed := ["agent_plugins_v1", "claude_code_v1", "agent_plugins_v2", "claude_code_v2",
    "agent_plugins_v3", "claude_code_v3", "claude_code_v4", "codex_plugin_v1",
    "claude_code_v5", "codex_plugin_v2", "claude_code_portable_v1",
    "codex_plugin_portable_v1", "claude_code_portable_v2", "codex_plugin_portable_v2"]
  unless !keys.isEmpty && keys.all allowed.contains do
    throw "expected one or more native package digests"
  let readDigest (key : String) : Except String (Option String) := do
    if keys.contains key then some <$> readHex (← json.getObjVal? key)
    else pure none
  return ⟨← readDigest "agent_plugins_v1", ← readDigest "claude_code_v1",
    ← readDigest "agent_plugins_v2", ← readDigest "claude_code_v2",
    ← readDigest "agent_plugins_v3", ← readDigest "claude_code_v3",
    ← readDigest "claude_code_v4", ← readDigest "codex_plugin_v1",
    ← readDigest "claude_code_v5", ← readDigest "codex_plugin_v2",
    ← readDigest "claude_code_portable_v1", ← readDigest "codex_plugin_portable_v1",
    ← readDigest "claude_code_portable_v2", ← readDigest "codex_plugin_portable_v2"⟩

private def readReleaseContents (json : Json) : Except String ReleaseContents := do
  match ← (← json.getObjVal? "type").getStr? with
  | "plugin" =>
    checkFields json ["type", "plugin", "packages"]
    return .plugin (← readPluginId (← json.getObjVal? "plugin"))
      (← readPackageDigests (← json.getObjVal? "packages"))
  | "mcp" =>
    checkFields json ["type", "service", "contract"]
    return .mcp ⟨← readNonempty (← json.getObjVal? "service")⟩
      ⟨← readHex (← json.getObjVal? "contract")⟩
  | tag => throw s!"unknown release contents: {tag}"

private def readRelease (json : Json) : Except String Release := do
  checkFields json ["key", "version", "origin", "contents"]
  return ⟨← readReleaseKey (← json.getObjVal? "key"),
    ← readNonempty (← json.getObjVal? "version"),
    ← readReleaseOrigin (← json.getObjVal? "origin"),
    ← readReleaseContents (← json.getObjVal? "contents")⟩

private def readLedger (json : Json) : Except String ReleaseLedger := do
  (← json.getArr?).toList.mapM readRelease

def readPackageFormat (json : Json) : Except String PackageFormat := do
  match ← json.getStr? with
  | "agent_plugins_v1" => pure .agentPluginsV1
  | "claude_code_v1" => pure .claudeCodeV1
  | "agent_plugins_v2" => pure .agentPluginsV2
  | "claude_code_v2" => pure .claudeCodeV2
  | "agent_plugins_v3" => pure .agentPluginsV3
  | "claude_code_v3" => pure .claudeCodeV3
  | "claude_code_v4" => pure .claudeCodeV4
  | "codex_plugin_v1" => pure .codexPluginV1
  | "claude_code_v5" => pure .claudeCodeV5
  | "codex_plugin_v2" => pure .codexPluginV2
  | "claude_code_portable_v1" => pure .claudeCodePortableV1
  | "codex_plugin_portable_v1" => pure .codexPluginPortableV1
  | "claude_code_portable_v2" => pure .claudeCodePortableV2
  | "codex_plugin_portable_v2" => pure .codexPluginPortableV2
  | tag => throw s!"unknown package format: {tag}"

private def readReleaseTarget (json : Json) : Except String ReleaseTarget := do
  match ← (← json.getObjVal? "type").getStr? with
  | "plugin" =>
    checkFields json ["type", "format"]
    return .plugin (← readPackageFormat (← json.getObjVal? "format"))
  | "mcp" =>
    checkFields json ["type"]
    return .mcp
  | tag => throw s!"unknown release target: {tag}"

private def writeOptionalDigest (key : String) : Option String → List (String × Json)
  | none => []
  | some digest => [(key, .str digest)]

private def writePackageDigests (packages : FormatDigests) : Json :=
  Json.mkObj (writeOptionalDigest "agent_plugins_v1" packages.agentPluginsV1 ++
    writeOptionalDigest "claude_code_v1" packages.claudeCodeV1 ++
    writeOptionalDigest "agent_plugins_v2" packages.agentPluginsV2 ++
    writeOptionalDigest "claude_code_v2" packages.claudeCodeV2 ++
    writeOptionalDigest "agent_plugins_v3" packages.agentPluginsV3 ++
    writeOptionalDigest "claude_code_v3" packages.claudeCodeV3 ++
    writeOptionalDigest "claude_code_v4" packages.claudeCodeV4 ++
    writeOptionalDigest "codex_plugin_v1" packages.codexPluginV1 ++
    writeOptionalDigest "claude_code_v5" packages.claudeCodeV5 ++
    writeOptionalDigest "codex_plugin_v2" packages.codexPluginV2 ++
    writeOptionalDigest "claude_code_portable_v1" packages.claudeCodePortableV1 ++
    writeOptionalDigest "codex_plugin_portable_v1" packages.codexPluginPortableV1 ++
    writeOptionalDigest "claude_code_portable_v2" packages.claudeCodePortableV2 ++
    writeOptionalDigest "codex_plugin_portable_v2" packages.codexPluginPortableV2)

private def writeReleaseKey (key : ReleaseKey) : Json := Json.mkObj [
  ("organization", .str key.organization.value),
  ("integration", .str key.integration.value),
  ("release", .str key.release.value)
]

private def writeReleaseOrigin : ReleaseOrigin → Json
  | .repository repository commit path => tagged "repository" [
      ("repository", .str repository), ("commit", .str commit), ("path", .str path)
    ]
  | .artifact location digest => tagged "artifact" [
      ("location", .str location), ("digest", .str digest)
    ]

private def writeReleaseContents : ReleaseContents → Json
  | .plugin plugin packages => tagged "plugin" [
      ("plugin", .str plugin), ("packages", writePackageDigests packages)
    ]
  | .mcp service contract => tagged "mcp" [
      ("service", .str service.value), ("contract", .str contract.value)
    ]

private def writeRelease (release : Release) : Json := Json.mkObj [
  ("key", writeReleaseKey release.key),
  ("version", .str release.version),
  ("origin", writeReleaseOrigin release.origin),
  ("contents", writeReleaseContents release.contents)
]

def writePackageFormat : PackageFormat → String
  | .agentPluginsV1 => "agent_plugins_v1"
  | .claudeCodeV1 => "claude_code_v1"
  | .agentPluginsV2 => "agent_plugins_v2"
  | .claudeCodeV2 => "claude_code_v2"
  | .agentPluginsV3 => "agent_plugins_v3"
  | .claudeCodeV3 => "claude_code_v3"
  | .claudeCodeV4 => "claude_code_v4"
  | .codexPluginV1 => "codex_plugin_v1"
  | .claudeCodeV5 => "claude_code_v5"
  | .codexPluginV2 => "codex_plugin_v2"
  | .claudeCodePortableV1 => "claude_code_portable_v1"
  | .codexPluginPortableV1 => "codex_plugin_portable_v1"
  | .claudeCodePortableV2 => "claude_code_portable_v2"
  | .codexPluginPortableV2 => "codex_plugin_portable_v2"

private def writeSelectedArtifact : SelectedArtifact → Json
  | .plugin plugin format digest => tagged "plugin" [
      ("plugin", .str plugin), ("format", .str (writePackageFormat format)), ("digest", .str digest)
    ]
  | .mcp service contract => tagged "mcp" [
      ("service", .str service.value), ("contract", .str contract.value)
    ]

private def writeRegistration : Registration → Json
  | .registered ledger => tagged "registered" [
      ("ledger", .arr (ledger.map writeRelease).toArray)
    ]
  | .unchanged => tagged "unchanged"
  | .conflict => tagged "conflict"

private def writeBlockReason : BlockReason → String
  | .releaseMissing => "release_missing"
  | .releaseConflict => "release_conflict"
  | .kindMismatch => "kind_mismatch"
  | .formatUnavailable => "format_unavailable"

private def writeResolution : Resolution → Json
  | .resolved release artifact => tagged "resolved" [
      ("release", writeRelease release), ("artifact", writeSelectedArtifact artifact)
    ]
  | .blocked reason => tagged "blocked" [("reason", .str (writeBlockReason reason))]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← (← request.getObjVal? "schema").getNum?
  unless schema.toFloat == (1.0 : Float) do throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "catalog_register" => do
      checkFields input ["ledger", "release"]
      let ledger ← readLedger (← input.getObjVal? "ledger")
      let release ← readRelease (← input.getObjVal? "release")
      pure (writeRegistration (model.register ledger release))
    | "catalog_resolve" => do
      checkFields input ["ledger", "key", "target"]
      let ledger ← readLedger (← input.getObjVal? "ledger")
      let key ← readReleaseKey (← input.getObjVal? "key")
      let target ← readReleaseTarget (← input.getObjVal? "target")
      pure (writeResolution (model.resolve ledger key target))
    | value => throw s!"unknown catalog request: {value}"
  return Json.mkObj [("schema", 1), ("type", .str tag), ("output", output)]

end PluginSdk.Catalog.Wire
