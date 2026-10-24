import PluginSdk.Catalog.Tools.Types

namespace PluginSdk.Catalog.Tools

def nameKey (name : Authorization.ToolName) : Compiler.Key :=
  [name.value]

def toolKey (tool : ToolDescriptor) : Compiler.Key :=
  [tool.name.value]

def issueKey (issue : BindingIssue) : Compiler.Key :=
  [BindingIssueKey issue]

def repeatedNameCandidates (input : List ToolDescriptor) : List Authorization.ToolName :=
  (input.map (·.name)).filter fun name => decide (1 < CountName input name)

def duplicateNames (input : List ToolDescriptor) : List Authorization.ToolName :=
  Compiler.ordered nameKey (Compiler.unique (repeatedNameCandidates input))

def normalize (input : List ToolDescriptor) : ToolResult :=
  if h : duplicateNames input = [] then
    .accepted (Compiler.ordered toolKey input)
  else
    .rejected (Compiler.nonempty (duplicateNames input) h)

def bindingIssueCandidates (input : BindingInput) : List BindingIssue :=
  (if input.actual.digest = input.expected.digest then [] else [.digestMismatch]) ++
  (if input.actual.organization = input.expected.organization then [] else [.organizationMismatch]) ++
  (if input.actual.service = input.expected.service then [] else [.serviceMismatch])

def bindingIssues (input : BindingInput) : List BindingIssue :=
  Compiler.ordered issueKey (Compiler.unique (bindingIssueCandidates input))

def bind (input : BindingInput) : BindingResult :=
  if h : bindingIssues input = [] then .accepted
  else .rejected (Compiler.nonempty (bindingIssues input) h)

def model : Interface := ⟨normalize, bind⟩

end PluginSdk.Catalog.Tools
