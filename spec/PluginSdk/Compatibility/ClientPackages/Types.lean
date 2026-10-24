import PluginSdk.Compiler.Process.Types

namespace PluginSdk.Compatibility.ClientPackages

abbrev PackageClient := Compiler.Process.Host

inductive Client where
  | claudeCode
  | codex
  | cursor
  deriving DecidableEq, Repr

abbrev BuildInput := NonemptyList Client

inductive PackageClients where
  | claudeCode
  | codex
  | both
  deriving DecidableEq, Repr

def PackageClients.toList : PackageClients → List PackageClient
  | .claudeCode => [.claudeCode]
  | .codex => [.codex]
  | .both => [.claudeCode, .codex]

def FitsClient : Client → PackageClient → Bool
  | .claudeCode, .claudeCode | .cursor, .claudeCode | .codex, .codex => true
  | .claudeCode, .codex | .cursor, .codex | .codex, .claudeCode => false

def RequiredClients (input : BuildInput) : List PackageClient :=
  [.claudeCode, .codex].filter fun family => input.toList.any fun client => FitsClient client family

def legacyClient : PackageClient → Client
  | .claudeCode => .claudeCode
  | .codex => .codex

def replaceCursor : Client → Client
  | .claudeCode => .claudeCode
  | .codex => .codex
  | .cursor => .claudeCode

def replaceCursorInput (input : BuildInput) : BuildInput :=
  ⟨replaceCursor input.head, input.tail.map replaceCursor⟩

structure Interface where
  packageClient : Client → PackageClient
  buildClients : BuildInput → PackageClients

end PluginSdk.Compatibility.ClientPackages
