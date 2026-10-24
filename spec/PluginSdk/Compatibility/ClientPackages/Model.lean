import PluginSdk.Compatibility.ClientPackages.Types

namespace PluginSdk.Compatibility.ClientPackages

def packageClient : Client → PackageClient
  | .claudeCode => .claudeCode
  | .codex => .codex
  | .cursor => .claudeCode

def hasPackageClient (packages : List PackageClient) (family : PackageClient) : Bool :=
  packages.any (fun candidate => decide (candidate = family))

def clientsFromPresence (hasClaudeCode hasCodex : Bool) : PackageClients :=
  match hasClaudeCode, hasCodex with
  | true, true => .both
  | true, false => .claudeCode
  | false, true => .codex
  | false, false => .claudeCode

def buildClients (input : BuildInput) : PackageClients :=
  let packages := input.toList.map packageClient
  clientsFromPresence (hasPackageClient packages .claudeCode) (hasPackageClient packages .codex)

def model : Interface := ⟨packageClient, buildClients⟩

end PluginSdk.Compatibility.ClientPackages
