import PluginSdk.Compiler.Types

namespace PluginSdk.Compiler

def manifestPath : Format → String
  | .agentPluginsV1 => "plugin.json"
  | .claudeCodeV1 => ".claude-plugin/plugin.json"

def mcpPath : Format → String
  | .agentPluginsV1 => "mcp.json"
  | .claudeCodeV1 => ".mcp.json"

def transport : Format → String
  | .agentPluginsV1 => "streamable-http"
  | .claudeCodeV1 => "http"

def Field (object : Lean.Json) (key : String) (value : Lean.Json) : Prop :=
  object.getObjVal? key = .ok value

def ObjectKeys (object : Lean.Json) (keys : List String) : Prop :=
  (∃ fields, object = .obj fields) ∧
  ∀ key, (∃ value, Field object key value) ↔ key ∈ keys

def SchemaField (format : Format) (object : Lean.Json) (name : String) : Prop :=
  match format with
  | .agentPluginsV1 =>
    Field object "$schema" (.str ("https://agent-plugins.org/schemas/1.0.0/" ++ name ++ ".schema.json"))
  | .claudeCodeV1 => True

def NativeManifest (input : RenderInput) (file : RenderedFile) : Prop :=
  match file with
  | .copy _ _ => False
  | .json path object =>
    path.value = manifestPath input.format ∧
    ObjectKeys object.value (match input.format with
      | .agentPluginsV1 => ["$schema", "name", "version", "description"]
      | .claudeCodeV1 => ["name", "version", "description"]) ∧
    SchemaField input.format object.value "plugin" ∧
    Field object.value "name" (.str input.metadata.id) ∧
    Field object.value "version" (.str input.metadata.version) ∧
    Field object.value "description" (.str input.metadata.description)

def NativeServer (format : Format) (source : RemoteMcp) (value : Lean.Json) : Prop :=
  ObjectKeys value ["type", "url", "headers"] ∧
  Field value "type" (.str (transport format)) ∧ Field value "url" (.str source.url) ∧
  ∃ headers, Field value "headers" headers ∧ ObjectKeys headers (source.headers.map Prod.fst)

def NativeMcp (input : RenderInput) (file : RenderedFile) : Prop :=
  match file with
  | .copy _ _ => False
  | .json path object =>
    input.mcp ≠ [] ∧ path.value = mcpPath input.format ∧
    ObjectKeys object.value (match input.format with
      | .agentPluginsV1 => ["$schema", "mcpServers"]
      | .claudeCodeV1 => ["mcpServers"]) ∧
    SchemaField input.format object.value "mcp" ∧
    ∃ servers, Field object.value "mcpServers" servers ∧
      ObjectKeys servers (input.mcp.map Prod.fst) ∧
      ∀ name source, (name, source) ∈ input.mcp →
        ∃ value, Field servers name value ∧ NativeServer input.format source value

def HeaderAt (file : RenderedFile) (server header value : String) : Prop :=
  match file with
  | .copy _ _ => False
  | .json _ object =>
    ∃ servers entry headers, Field object.value "mcpServers" servers ∧
      Field servers server entry ∧ Field entry "headers" headers ∧ Field headers header (.str value)

def HasExpansion (value : String) : Prop := ['$', '{'].IsInfix value.toList

def HeaderMeaning (format : Format) (requested : HeaderValue) (native : String) : Prop :=
  match requested with
  | .literal value =>
    native = value ∧ (format = .agentPluginsV1 ∨ ¬ HasExpansion value)
  | .environment name literalPrefix =>
    format = .claudeCodeV1 ∧ ¬ HasExpansion literalPrefix ∧ native = literalPrefix ++ "${" ++ name ++ "}"

def SourceUnsupported (format : Format) (source : RemoteMcp) (reason : McpProblem) : Prop :=
    match reason with
    | .environmentReference header =>
      format = .agentPluginsV1 ∧ ∃ name environmentName literalPrefix,
        (name, .environment environmentName literalPrefix) ∈ source.headers ∧ header = asciiFold name
    | .literalExpansion header =>
      format = .claudeCodeV1 ∧ ∃ name value,
        (name, value) ∈ source.headers ∧ header = asciiFold name ∧
        match value with
        | .literal text => HasExpansion text
        | .environment _ literalPrefix => HasExpansion literalPrefix
    | .headerCollision header =>
      ∃ left right first second, (left, first) ∈ source.headers ∧
        (right, second) ∈ source.headers ∧ left ≠ right ∧
        asciiFold left = asciiFold right ∧ header = asciiFold left

def UnsupportedRequest (input : RenderInput) (server : String) (reason : McpProblem) : Prop :=
  ∃ source, (server, source) ∈ input.mcp ∧ SourceUnsupported input.format source reason

def SourceCopy (input : RenderInput) (path : String) (file : CapturedFile) : Prop :=
  ∃ skill ∈ input.skills,
    (path = "skills/" ++ skill.name.value ++ "/SKILL.md" ∧ file = skill.entry) ∨
    ∃ asset ∈ skill.assets,
      path = "skills/" ++ skill.name.value ++ "/" ++ asset.path.value ∧ file = asset.file

def requestedPaths (input : RenderInput) : List String :=
  [manifestPath input.format] ++ (if input.mcp = [] then [] else [mcpPath input.format]) ++
  input.skills.flatMap fun skill =>
    ("skills/" ++ skill.name.value ++ "/SKILL.md") ::
      skill.assets.map (fun asset => "skills/" ++ skill.name.value ++ "/" ++ asset.path.value)

def CollisionAt (left right key : String) : Prop :=
    ((key = asciiFold left ∧
      (asciiFold left = asciiFold right ∨ (asciiFold right).startsWith (asciiFold left ++ "/") = true)) ∨
     (key = asciiFold right ∧ (asciiFold left).startsWith (asciiFold right ++ "/") = true))

def RequestedCollision (input : RenderInput) (key : String) : Prop :=
  ∃ left right, [left, right].Sublist (requestedPaths input) ∧ CollisionAt left right key

def Representable (input : RenderInput) : Prop :=
  (requestedPaths input).Pairwise (fun left right => ¬ PathsConflict left right) ∧
  ∀ server reason, ¬ UnsupportedRequest input server reason

def IssueKey : RenderIssue → List String
  | .pathCollision path => ["path_collision", path]
  | .unsupportedMcp server reason =>
    ["unsupported_mcp", server] ++ match reason with
      | .environmentReference header => ["environment_reference", header]
      | .literalExpansion header => ["literal_expansion", header]
      | .headerCollision header => ["header_collision", header]

end PluginSdk.Compiler
