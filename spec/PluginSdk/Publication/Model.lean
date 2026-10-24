import PluginSdk.Publication.Types

namespace PluginSdk.Publication

def publishInput (input : Input) : Result :=
  if ValidHistory input.history then
    if HasKey input then
      if input.desired ∈ input.history then
        .unchanged input.history
      else
        .blocked .versionConflict
    else
      .published (input.history ++ [input.desired])
  else
    .blocked .duplicate

def model : Interface := ⟨publishInput⟩

end PluginSdk.Publication
