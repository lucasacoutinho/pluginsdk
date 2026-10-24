import PluginSdk.WindowsPath.Properties

namespace PluginSdk.WindowsPath

def classify (input : Input) : Decision :=
  if HasSyntax input.path then .syntax
  else if HasDevice input.path then .device
  else if HasComponentOverflow input then .componentLimit
  else if ¬ PathWithinLimit input then .pathLimit
  else .accepted

def deriveRootCapacity (input : RootInput) : RootResolution :=
  if rootViewsWithin input then
    .available ⟨input.maxComponentUnits, minimumRemaining input⟩
  else .refused

def matchesNativePath (input : NativePathInput) : Bool :=
  if input.reported == input.expected then true
  else input.platform == "win32" && ordinaryDosPath input.expected &&
    input.reported == extendedDosPath input.expected

def model : Interface := {
  classify := classify
  rootCapacity := deriveRootCapacity
  matchesNativePath := matchesNativePath
}

end PluginSdk.WindowsPath
