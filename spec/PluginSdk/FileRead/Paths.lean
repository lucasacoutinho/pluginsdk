import PluginSdk.FileRead.Types

namespace PluginSdk.FileRead

def splitOnCharacter (raw : String) (separator : Char) : List String :=
  let groups := raw.toList.foldr (fun char groups =>
    if char == separator then [] :: groups
    else match groups with
      | [] => [[char]]
      | head :: tail => (char :: head) :: tail) [[]]
  groups.map String.ofList

def containsColon (part : String) : Bool := part.toList.contains ':'

def supportedVolume (value : String) : Bool :=
  let chars := value.toList
  chars.take 7 == "Volume{".toList && chars.drop 43 == ['}'] && chars.length == 44 &&
    match splitOnCharacter (String.ofList (chars.drop 7 |>.take 36)) '-' with
    | [a, b, c, d, e] =>
      a.length == 8 && b.length == 4 && c.length == 4 && d.length == 4 &&
        e.length == 12 && [a, b, c, d, e].all
          (fun part => part.toList.all ("0123456789abcdefABCDEF".toList.contains ·))
    | _ => false

def volumeKey (value : String) : String :=
  String.ofList ((value.toList.drop 7 |>.take 36).map Char.toLower)

def components (parts : List String) : List String :=
  if parts == [""] then [] else parts

def validComponent (part : String) : Bool :=
  !part.toList.isEmpty && part != "." && part != ".." &&
    !part.toList.contains '/' && !part.toList.contains '\\' && !containsColon part &&
    !part.toList.contains (Char.ofNat 0)

def parsePath (raw : String) : ParsedPath :=
  match splitOnCharacter raw '\\' with
  | "" :: "" :: "?" :: volume :: parts =>
    if !supportedVolume volume || parts.isEmpty then .unsupported
    else if parts.any containsColon then .stream
    else if (components parts).all validComponent then
      .plain ⟨volumeKey volume, components parts⟩
    else .unsupported
  | _ => .unsupported

def PlainEvidence (raw : String) (path : CanonicalPath) : Prop :=
  ∃ volume parts, splitOnCharacter raw '\\' = "" :: "" :: "?" :: volume :: parts ∧
    supportedVolume volume = true ∧ parts.isEmpty = false ∧
    parts.any containsColon = false ∧
    (components parts).all validComponent = true ∧
    path = ⟨volumeKey volume, components parts⟩

def Contained (root file : CanonicalPath) : Prop :=
  root.volume = file.volume ∧ root.components.IsPrefix file.components ∧
    root.components.length < file.components.length

instance (root file : CanonicalPath) : Decidable (Contained root file) := by
  unfold Contained
  infer_instance

def EquivalentPaths (left right : String) : Prop :=
  ∃ path, parsePath left = .plain path ∧ parsePath right = .plain path

instance (left right : String) : Decidable (EquivalentPaths left right) :=
  match h : parsePath left with
  | .plain path =>
    if same : parsePath right = .plain path then
      isTrue ⟨path, h, same⟩
    else isFalse (by intro ⟨other, before, after⟩; cases h.symm.trans before; exact same after)
  | .stream => isFalse (by intro ⟨other, before, _⟩; cases h.symm.trans before)
  | .unsupported => isFalse (by intro ⟨other, before, _⟩; cases h.symm.trans before)

def ContainedPaths (root file : String) : Prop :=
  match parsePath root, parsePath file with
  | .plain root, .plain file => Contained root file
  | _, _ => False

instance (root file : String) : Decidable (ContainedPaths root file) := by
  unfold ContainedPaths
  split <;> infer_instance

end PluginSdk.FileRead
