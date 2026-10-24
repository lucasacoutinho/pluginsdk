import PluginSdk.Installer.ProjectFile.Types

namespace PluginSdk.Installer.ProjectFile

def admit (input : Input) : Decision :=
  if input.platform == "linux" then
    match input.observed with
    | .absent => .ready .absent
    | .file digest mode => .ready (.file digest mode)
    | .windowsFile _ _ _ _ => .blocked .representation
  else if input.platform == "win32" then
    match input.observed with
    | .absent => .ready .absent
    | .file _ _ => .blocked .representation
    | .windowsFile digest attributes security streams =>
      if SupportedAttributes attributes then
        if streams = .defaultOnly then
          .ready (.windowsFile digest attributes security)
        else
          .blocked .streams
      else
        .blocked .attributes
  else
    .blocked .platform

def review (input : ReviewInput) : Decision :=
  match admit input.current with
  | .blocked reason => .blocked reason
  | .ready basis =>
    if input.reviewed = basis then .ready basis else .blocked .changed

def model : Interface := ⟨admit, review⟩

end PluginSdk.Installer.ProjectFile
