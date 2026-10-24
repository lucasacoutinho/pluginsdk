import PluginSdk.ExecutableIntent.Types

namespace PluginSdk.ExecutableIntent

def HasExecute (mode : PermissionBits) : Prop :=
  mode.val / 64 % 2 = 1 ∨ mode.val / 8 % 2 = 1 ∨ mode.val % 2 = 1

def DataPermissions (mode : PermissionBits) : Nat × Nat × Nat :=
  (mode.val / 128 % 4, mode.val / 16 % 4, mode.val / 2 % 4)

instance (mode : PermissionBits) : Decidable (HasExecute mode) := by
  unfold HasExecute; infer_instance

def NativeAssignment (native : NativeFile) (intent : FileIntent) : Prop :=
  native.path = intent.path ∧ ∃ bits, native.mode = .posix bits bits ∧ intent.executable = decide (HasExecute bits)

def NativeAssignments : List NativeFile → List FileIntent → Prop
  | [], [] => True
  | native :: rest, intent :: tail => NativeAssignment native intent ∧ NativeAssignments rest tail
  | _, _ => False

def DeclaredReady (files executables : List String) : Prop :=
  files.Nodup ∧ executables.Nodup ∧ ∀ path ∈ executables, path ∈ files

def DeclaredFiles (files executables : List String) : List FileIntent :=
  files.map fun path => ⟨path, executables.contains path⟩

def ModeUnusable : ModeObservation → Prop
  | .posix before after => before ≠ after
  | .unrepresented | .unavailable => True

def Bound (input : PayloadInput) : Prop :=
  input.retained.path = input.observed.path ∧ input.retained.digest = input.observed.digest

def ModeMatches (executable : Bool) : ModeObservation → Prop
  | .posix before after => before = after ∧ executable = decide (HasExecute before)
  | .unrepresented => True
  | .unavailable => False

def PayloadReady (input : PayloadInput) : Prop := Bound input ∧ ModeMatches input.retained.executable input.observed.mode

def Duplicated (path : String) (paths : List String) : Prop := 2 ≤ paths.count path

def SourceFault (input : SourceInput) (reason : SourceReason) (path : String) : Prop :=
  match reason with
  | .duplicateFile => Duplicated path input.paths
  | .duplicateDeclaration => match input with
    | .declared _ executables => Duplicated path executables
    | .filesystem _ => False
  | .missingFile => match input with
    | .declared files executables => path ∈ executables ∧ path ∉ files
    | .filesystem _ => False
  | .unavailable => match input with
    | .filesystem files => ∃ file ∈ files, file.path = path ∧ file.mode = .unavailable
    | .declared _ _ => False
  | .unrepresented => match input with
    | .filesystem files => ∃ file ∈ files, file.path = path ∧ file.mode = .unrepresented
    | .declared _ _ => False
  | .changed => match input with
    | .filesystem files => ∃ file ∈ files, file.path = path ∧
        ∃ before after, file.mode = .posix before after ∧ before ≠ after
    | .declared _ _ => False

def PayloadFault (input : PayloadInput) : PayloadReason → Prop
  | .path => input.retained.path ≠ input.observed.path
  | .content => input.retained.digest ≠ input.observed.digest
  | .unavailable => input.observed.mode = .unavailable
  | .changed => ∃ before after, input.observed.mode = .posix before after ∧ before ≠ after
  | .intent => ∃ before after, input.observed.mode = .posix before after ∧
      input.retained.executable ≠ decide (HasExecute before)

end PluginSdk.ExecutableIntent
