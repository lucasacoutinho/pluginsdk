import Lean.Data.Json
import PluginSdk.Domain

namespace PluginSdk.Compiler

structure CapturedFile where
  digest : FileDigest
  executable : Bool
  deriving DecidableEq, Repr

structure Asset where
  path : PackagePath
  file : CapturedFile
  deriving DecidableEq

structure Skill where
  name : SkillName
  entry : CapturedFile
  assets : List Asset
  deriving DecidableEq

structure Metadata where
  id : String
  version : String
  description : String
  deriving DecidableEq, Repr

inductive HeaderValue where
  | literal (value : String)
  | environment (name literalPrefix : String)
  deriving DecidableEq, Repr

structure RemoteMcp where
  url : String
  headers : List (String × HeaderValue)
  deriving DecidableEq, Repr

structure RenderInput where
  format : Format
  metadata : Metadata
  skills : List Skill
  mcp : List (String × RemoteMcp)

structure JsonObject where
  value : Lean.Json
  isObject : ∃ fields, value = .obj fields

inductive RenderedFile where
  | copy (path : PackagePath) (file : CapturedFile)
  | json (path : PackagePath) (value : JsonObject)

def RenderedFile.path : RenderedFile → PackagePath
  | .copy path _ | .json path _ => path

inductive McpProblem where
  | environmentReference (header : String)
  | literalExpansion (header : String)
  | headerCollision (header : String)
  deriving DecidableEq, Repr

inductive RenderIssue where
  | pathCollision (path : String)
  | unsupportedMcp (server : String) (reason : McpProblem)
  deriving DecidableEq, Repr

inductive RenderResult where
  | rendered (files : NonemptyList RenderedFile)
  | rejected (issues : NonemptyList RenderIssue)

structure Interface where
  render : RenderInput → RenderResult

end PluginSdk.Compiler
