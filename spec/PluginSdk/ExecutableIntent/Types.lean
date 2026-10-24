namespace PluginSdk.ExecutableIntent

abbrev PermissionBits := Fin 512

inductive ModeObservation where
  | posix (before after : PermissionBits)
  | unrepresented
  | unavailable
  deriving DecidableEq, Repr

structure FileIntent where
  path : String
  executable : Bool
  deriving DecidableEq, Repr

structure NativeFile where
  path : String
  mode : ModeObservation
  deriving DecidableEq, Repr

inductive SourceInput where
  | filesystem (files : List NativeFile)
  | declared (files executables : List String)
  deriving DecidableEq, Repr

def SourceInput.paths : SourceInput → List String
  | .filesystem files => files.map (·.path)
  | .declared files _ => files

inductive NativeReason where
  | unavailable | unrepresented | changed
  deriving DecidableEq, Repr

inductive SourceReason where
  | duplicateFile | duplicateDeclaration | missingFile | unavailable | unrepresented | changed
  deriving DecidableEq, Repr

inductive SourceResolution where
  | resolved (files : List FileIntent)
  | refused (reason : SourceReason) (path : String)
  deriving DecidableEq, Repr

structure RetainedFile where
  path : String
  digest : String
  executable : Bool
  deriving DecidableEq, Repr

structure ObservedFile where
  path : String
  digest : String
  mode : ModeObservation
  deriving DecidableEq, Repr

structure PayloadInput where
  retained : RetainedFile
  observed : ObservedFile
  deriving DecidableEq, Repr

inductive PayloadReason where
  | path | content | unavailable | changed | intent
  deriving DecidableEq, Repr

inductive PayloadResolution where
  | resolved (executable : Bool)
  | refused (reason : PayloadReason)
  deriving DecidableEq, Repr

structure Interface where
  permissions : PermissionBits → Bool
  source : SourceInput → SourceResolution
  payload : PayloadInput → PayloadResolution
  stage : PermissionBits → Bool → PermissionBits

end PluginSdk.ExecutableIntent
