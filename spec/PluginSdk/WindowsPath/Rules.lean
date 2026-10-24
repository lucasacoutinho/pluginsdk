import PluginSdk.WindowsPath.Types

namespace PluginSdk.WindowsPath

def components (path : PluginSdk.PackagePath) : List String :=
  (path.value.toList.splitOn '/').map String.ofList

def utf16Units (value : String) : Nat :=
  value.toList.foldl (fun total character =>
    total + if character.toNat ≤ 65535 then 1 else 2) 0

def badSyntaxCharacter (character : Char) : Bool :=
  decide (character.toNat < 32) || ['<', '>', ':', '"', '\\', '|', '?', '*'].contains character

def badSyntaxComponent (component : String) : Bool :=
  component.toList.any badSyntaxCharacter ||
    (component.toList.reverse.head? == some ' ') ||
    (component.toList.reverse.head? == some '.')

def hasSyntax (path : PluginSdk.PackagePath) : Bool :=
  (components path).any badSyntaxComponent

def HasSyntax (path : PluginSdk.PackagePath) : Prop := hasSyntax path = true

instance (path : PluginSdk.PackagePath) : Decidable (HasSyntax path) := by
  unfold HasSyntax
  infer_instance

def asciiLower (character : Char) : Char :=
  if 'A' ≤ character ∧ character ≤ 'Z' then Char.ofNat (character.toNat + 32) else character

def deviceStem (component : String) : String :=
  let beforeExtension := component.toList.takeWhile (fun character => character != '.')
  let withoutTrailingSpaces :=
    (beforeExtension.reverse.dropWhile (fun character => character == ' ')).reverse
  String.ofList (withoutTrailingSpaces.map asciiLower)

def deviceStemNames : List String :=
  ["con", "prn", "aux", "nul", "conin$", "conout$"] ++
    ["com", "lpt"].flatMap (fun devicePrefix =>
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "¹", "²", "³"].map
        (fun suffix => devicePrefix ++ suffix))

def ReservedDeviceStem (stem : String) : Prop := stem ∈ deviceStemNames

instance (stem : String) : Decidable (ReservedDeviceStem stem) := by
  unfold ReservedDeviceStem
  infer_instance

def IsDeviceComponent (component : String) : Prop :=
  ReservedDeviceStem (deviceStem component)

instance (component : String) : Decidable (IsDeviceComponent component) := by
  unfold IsDeviceComponent
  infer_instance

def hasDevice (path : PluginSdk.PackagePath) : Bool :=
  (components path).any (fun component => decide (IsDeviceComponent component))

def HasDevice (path : PluginSdk.PackagePath) : Prop := hasDevice path = true

instance (path : PluginSdk.PackagePath) : Decidable (HasDevice path) := by
  unfold HasDevice
  infer_instance

def hasComponentOverflow (input : Input) : Bool :=
  (components input.path).any (fun component =>
    decide (utf16Units component > input.capacity.maxComponentUnits))

def HasComponentOverflow (input : Input) : Prop := hasComponentOverflow input = true

instance (input : Input) : Decidable (HasComponentOverflow input) := by
  unfold HasComponentOverflow
  infer_instance

def ComponentWithinLimits (input : Input) : Prop :=
  ∀ component, component ∈ components input.path →
    utf16Units component ≤ input.capacity.maxComponentUnits

def PathWithinLimit (input : Input) : Prop :=
  utf16Units input.path.value ≤ input.capacity.remainingPathUnits

instance (input : Input) : Decidable (PathWithinLimit input) := by
  unfold PathWithinLimit
  infer_instance

def rootSeparator (root : String) : List Char :=
  if root.toList.reverse.head? == some '\\' then [] else ['\\']

def rootOverhead (root : String) : Nat :=
  utf16Units root + (rootSeparator root).length + 1

def nativeName (root : String) (path : PluginSdk.PackagePath) : String :=
  String.ofList (root.toList ++ rootSeparator root ++
    path.value.toList.map (fun character => if character == '/' then '\\' else character) ++ ['\x00'])

def viewRemaining (view : RootView) : Nat :=
  view.maxPathBufferUnits - rootOverhead view.root

def rootViewsWithin (input : RootInput) : Bool :=
  input.views.all (fun view => decide (rootOverhead view.root ≤ view.maxPathBufferUnits))

def minimumRemaining (input : RootInput) : Nat :=
  (input.tail.map viewRemaining).foldl Nat.min (viewRemaining input.head)

def RootCapacityFacts (input : RootInput) (resolution : RootResolution) : Prop :=
  match resolution with
  | .refused => ∃ view, view ∈ input.views ∧ view.maxPathBufferUnits < rootOverhead view.root
  | .available capacity =>
      capacity.maxComponentUnits = input.maxComponentUnits ∧
      (∀ view, view ∈ input.views →
        rootOverhead view.root + capacity.remainingPathUnits ≤ view.maxPathBufferUnits) ∧
      ∃ view, view ∈ input.views ∧
        rootOverhead view.root + capacity.remainingPathUnits = view.maxPathBufferUnits

def ordinaryDosComponent (component : List Char) : Bool :=
  !component.isEmpty && !component.contains '/' &&
    !badSyntaxComponent (String.ofList component) &&
    !decide (IsDeviceComponent (String.ofList component))

def ordinaryDosPath (path : String) : Bool :=
  match path.toList with
  | drive :: ':' :: '\\' :: tail =>
    decide (('A' ≤ drive ∧ drive ≤ 'Z') ∨ ('a' ≤ drive ∧ drive ≤ 'z')) &&
      (tail.isEmpty || (tail.splitOn '\\').all ordinaryDosComponent)
  | _ => false

def extendedDosPath (path : String) : String := "\\\\?\\" ++ path

def NativePathFacts (input : NativePathInput) : Prop :=
  input.reported = input.expected ∨
    input.platform = "win32" ∧ ordinaryDosPath input.expected = true ∧
      input.reported = extendedDosPath input.expected

end PluginSdk.WindowsPath
