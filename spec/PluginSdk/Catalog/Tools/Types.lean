import PluginSdk.Authorization.Types
import PluginSdk.Compiler.Canonical

namespace PluginSdk.Catalog.Tools

structure ToolMetadataDigest where
  value : String
  deriving DecidableEq, Repr

structure ToolDescriptor where
  name : Authorization.ToolName
  digest : ToolMetadataDigest
  deriving DecidableEq, Repr

inductive ToolResult where
  | accepted (tools : List ToolDescriptor)
  | rejected (tools : NonemptyList Authorization.ToolName)

structure ContractIdentity where
  organization : Authorization.OrganizationId
  service : Authorization.ServiceId
  digest : Authorization.ContractDigest
  deriving DecidableEq, Repr

structure BindingInput where
  expected : ContractIdentity
  actual : ContractIdentity

inductive BindingIssue where
  | digestMismatch
  | organizationMismatch
  | serviceMismatch
  deriving DecidableEq, Repr

inductive BindingResult where
  | accepted
  | rejected (issues : NonemptyList BindingIssue)

structure Interface where
  normalize : List ToolDescriptor → ToolResult
  bind : BindingInput → BindingResult

def CountName (tools : List ToolDescriptor) (name : Authorization.ToolName) : Nat :=
  tools.countP (fun tool => tool.name == name)

def BindingMatches (input : BindingInput) : Prop :=
  input.actual.organization = input.expected.organization ∧
    input.actual.service = input.expected.service ∧
    input.actual.digest = input.expected.digest

def RequiredBindingIssue (input : BindingInput) : BindingIssue → Prop
  | .digestMismatch => input.actual.digest ≠ input.expected.digest
  | .organizationMismatch => input.actual.organization ≠ input.expected.organization
  | .serviceMismatch => input.actual.service ≠ input.expected.service

def BindingIssueKey : BindingIssue → String
  | .digestMismatch => "digest_mismatch"
  | .organizationMismatch => "organization_mismatch"
  | .serviceMismatch => "service_mismatch"

end PluginSdk.Catalog.Tools
