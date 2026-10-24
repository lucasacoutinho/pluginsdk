import PluginSdk.ExecutableIntent.Rules

namespace PluginSdk.ExecutableIntent

def executeBits (bits : PermissionBits) : Bool := bits.val &&& 73 != 0

def firstDuplicate : List String → Option String
  | [] => none
  | path :: paths => if paths.contains path then some path else firstDuplicate paths

def nativeIntent : ModeObservation → Except NativeReason Bool
  | .posix before after => if before = after then .ok (executeBits before) else .error .changed
  | .unrepresented => .error .unrepresented
  | .unavailable => .error .unavailable

def sourceReason : NativeReason → SourceReason
  | .unavailable => .unavailable
  | .unrepresented => .unrepresented
  | .changed => .changed

def nativeFiles : List NativeFile → SourceResolution
  | [] => .resolved []
  | file :: rest => match nativeIntent file.mode with
    | .error reason => .refused (sourceReason reason) file.path
    | .ok executable => match nativeFiles rest with
      | .resolved files => .resolved (⟨file.path, executable⟩ :: files)
      | .refused reason path => .refused reason path

def resolveSource (input : SourceInput) : SourceResolution :=
  match firstDuplicate input.paths with
  | some path => .refused .duplicateFile path
  | none => match input with
    | .filesystem files => nativeFiles files
    | .declared files executables => match firstDuplicate executables with
      | some path => .refused .duplicateDeclaration path
      | none => match executables.find? (fun path => !files.contains path) with
        | some path => .refused .missingFile path
        | none => .resolved (DeclaredFiles files executables)

def resolvePayload (input : PayloadInput) : PayloadResolution :=
  if input.retained.path ≠ input.observed.path then .refused .path
  else if input.retained.digest ≠ input.observed.digest then .refused .content
  else match input.observed.mode with
    | .unavailable => .refused .unavailable
    | .unrepresented => .resolved input.retained.executable
    | .posix before after =>
      if before ≠ after then .refused .changed
      else if executeBits before ≠ input.retained.executable then .refused .intent
      else .resolved input.retained.executable

def stagePermissions (current : PermissionBits) (executable : Bool) : PermissionBits :=
  let adjusted := if executeBits current == executable then current.val
    else if executable then current.val ||| 64 else current.val &&& 438
  ⟨adjusted % 512, Nat.mod_lt _ (by decide)⟩

def model : Interface := ⟨executeBits, resolveSource, resolvePayload, stagePermissions⟩

end PluginSdk.ExecutableIntent
