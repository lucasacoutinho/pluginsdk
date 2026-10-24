import PluginSdk.Compiler.Agents.Types

namespace PluginSdk.Installer.ProjectActivation

open PluginSdk.Compiler

abbrev AgentName := PluginSdk.Compiler.Agents.Name

inductive Platform where
  | linux
  | windows
  deriving DecidableEq

structure Registration where
  plugin : String
  marketplace : String
  root : String
  deriving DecidableEq

structure Binding where
  name : String
  configFile : String
  deriving DecidableEq

structure Activation where
  registration : Registration
  agents : List Binding
  deriving DecidableEq

structure Cache where
  directory : String
  payload : String
  deriving DecidableEq

structure BuildInput where
  platform : Platform
  home : String
  version : String
  registration : Registration
  agents : List AgentName

inductive BuildResult where
  | rendered (cache : Cache) (activation : Activation)
  | rejected (duplicates : NonemptyList AgentName)

inductive Source where
  | managed
  | foreign
  deriving DecidableEq

inductive Observation where
  | declared (source : Source) (declaredName name : String) (configFile : Option String)
  | discovered (name path : String)
  | unknown
  deriving DecidableEq

structure AuthorityInput where
  previous : List Binding
  desired : List Binding
  observed : List Observation

inductive Reason where
  | duplicate
  | unknown
  | unowned
  | drift
  deriving DecidableEq

inductive AuthorityResult where
  | ready
  | blocked (reason : Reason)
  deriving DecidableEq

structure Interface where
  build : BuildInput → BuildResult
  review : AuthorityInput → AuthorityResult

def Separator : Platform → String
  | .linux => "/"
  | .windows => "\\"

def SeparatorChar : Platform → Char
  | .linux => '/'
  | .windows => '\\'

def NativePath (platform : Platform) (root : String) (components : List String) : String :=
  String.ofList ((root.toList.reverse.dropWhile (fun c => c == SeparatorChar platform)).reverse) ++
    Separator platform ++ String.intercalate (Separator platform) components

def CacheMatches (input : BuildInput) (cache : Cache) : Prop :=
  cache.directory = NativePath input.platform input.home ["plugins", "cache", input.registration.marketplace] ∧
  cache.payload = NativePath input.platform cache.directory [input.registration.plugin, input.version]

def BindingMatches (input : BuildInput) (cache : Cache) (agent : AgentName) (binding : Binding) : Prop :=
  binding.name = input.registration.plugin ++ ":" ++ agent.value ∧
  binding.configFile = NativePath input.platform cache.payload ["agents", agent.value ++ ".toml"]

def Repeated (input : BuildInput) (agent : AgentName) : Prop :=
  1 < input.agents.countP (fun other => other == agent)

instance (input : BuildInput) (agent : AgentName) : Decidable (Repeated input agent) := by
  unfold Repeated
  infer_instance

def NameKey (name : AgentName) : Key := [name.value]

def UniqueBindings (bindings : List Binding) : Prop :=
  (bindings.map Binding.name).Nodup ∧ (bindings.map Binding.configFile).Nodup

def UniqueBasis (input : AuthorityInput) : Prop :=
  UniqueBindings input.previous ∧ UniqueBindings input.desired

def HasRoles (input : AuthorityInput) : Prop := input.previous ≠ [] ∨ input.desired ≠ []

def RelevantName (input : AuthorityInput) (name : String) : Prop :=
  name ∈ (input.previous ++ input.desired).map Binding.name

def RelevantPath (input : AuthorityInput) (path : String) : Prop :=
  path ∈ (input.previous ++ input.desired).map Binding.configFile

instance (input : AuthorityInput) (name : String) : Decidable (RelevantName input name) := by
  unfold RelevantName
  infer_instance

instance (input : AuthorityInput) (path : String) : Decidable (RelevantPath input path) := by
  unfold RelevantPath
  infer_instance

def ForeignConflict (input : AuthorityInput) : Observation → Prop
  | .declared .managed _ _ _ => False
  | .declared .foreign declaredName name file =>
      RelevantName input declaredName ∨ RelevantName input name ∨
        match file with | none => False | some path => RelevantPath input path
  | .discovered name path => RelevantName input name ∨ RelevantPath input path
  | .unknown => False

instance (input : AuthorityInput) (observation : Observation) : Decidable (ForeignConflict input observation) := by
  cases observation with
  | declared source declaredName name file =>
    cases source <;> cases file <;> unfold ForeignConflict <;> infer_instance
  | discovered name path => unfold ForeignConflict; infer_instance
  | unknown => unfold ForeignConflict; infer_instance

def Known (input : AuthorityInput) : Prop := Observation.unknown ∉ input.observed

def NoForeignConflict (input : AuthorityInput) : Prop :=
  ∀ observation ∈ input.observed, ¬ ForeignConflict input observation

def OwnedObservation (binding : Binding) : Observation :=
  .declared .managed binding.name binding.name (some binding.configFile)

def OwnedAllowed (input : AuthorityInput) : Observation → Prop
  | .declared .managed declaredName name file =>
      ∃ binding ∈ input.previous, Observation.declared .managed declaredName name file = OwnedObservation binding
  | .declared .foreign _ _ _ | .discovered _ _ | .unknown => True

instance (input : AuthorityInput) (observation : Observation) : Decidable (OwnedAllowed input observation) := by
  cases observation with
  | declared source declaredName name file => cases source <;> unfold OwnedAllowed <;> infer_instance
  | discovered name path => unfold OwnedAllowed; infer_instance
  | unknown => unfold OwnedAllowed; infer_instance

def OwnedExact (input : AuthorityInput) : Prop :=
  (∀ binding ∈ input.previous, input.observed.count (OwnedObservation binding) = 1) ∧
  (∀ observation ∈ input.observed, OwnedAllowed input observation)

def Safe (input : AuthorityInput) : Prop :=
  ¬ HasRoles input ∨ (UniqueBasis input ∧ Known input ∧ NoForeignConflict input ∧ OwnedExact input)

def RequiredReason (input : AuthorityInput) (reason : Reason) : Prop :=
  HasRoles input ∧ match reason with
  | .duplicate => ¬ UniqueBasis input
  | .unknown => UniqueBasis input ∧ ¬ Known input
  | .unowned => UniqueBasis input ∧ Known input ∧ ¬ NoForeignConflict input
  | .drift => UniqueBasis input ∧ Known input ∧ NoForeignConflict input ∧ ¬ OwnedExact input

instance (input : AuthorityInput) : Decidable (UniqueBasis input) := by
  unfold UniqueBasis UniqueBindings
  infer_instance

instance (input : AuthorityInput) : Decidable (HasRoles input) := by
  unfold HasRoles
  infer_instance

instance (input : AuthorityInput) : Decidable (Known input) := by
  unfold Known
  infer_instance

instance (input : AuthorityInput) : Decidable (NoForeignConflict input) := by
  unfold NoForeignConflict
  infer_instance

instance (input : AuthorityInput) : Decidable (OwnedExact input) := by
  unfold OwnedExact
  infer_instance

end PluginSdk.Installer.ProjectActivation
