import PluginSdk.Installer.ProjectActivation.Types

namespace PluginSdk.Installer.ProjectActivation

open PluginSdk.Compiler

def duplicateAgents (input : BuildInput) : List AgentName :=
  ordered NameKey (unique (input.agents.filter fun agent => decide (Repeated input agent)))

def nativeCache (input : BuildInput) : Cache :=
  let directory := NativePath input.platform input.home ["plugins", "cache", input.registration.marketplace]
  ⟨directory, NativePath input.platform directory [input.registration.plugin, input.version]⟩

def nativeBinding (input : BuildInput) (cache : Cache) (agent : AgentName) : Binding :=
  ⟨input.registration.plugin ++ ":" ++ agent.value,
    NativePath input.platform cache.payload ["agents", agent.value ++ ".toml"]⟩

def build (input : BuildInput) : BuildResult :=
  let duplicates := duplicateAgents input
  if empty : duplicates = [] then
    let cache := nativeCache input
    .rendered cache ⟨input.registration, (ordered NameKey input.agents).map (nativeBinding input cache)⟩
  else .rejected (nonempty duplicates empty)

def review (input : AuthorityInput) : AuthorityResult :=
  if ¬ HasRoles input then .ready
  else if ¬ UniqueBasis input then .blocked .duplicate
  else if ¬ Known input then .blocked .unknown
  else if ¬ NoForeignConflict input then .blocked .unowned
  else if OwnedExact input then .ready
  else .blocked .drift

def model : Interface := ⟨build, review⟩

end PluginSdk.Installer.ProjectActivation
