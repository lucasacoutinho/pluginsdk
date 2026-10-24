import PluginSdk.Installer.LocalPackage.Types

namespace PluginSdk.Installer.LocalPackage

open PluginSdk.Installer.LocalSlot

def classify (input : Input) : PluginSdk.Installer.LocalSlot.Observation :=
  match input.observed with
  | .absent => .absent
  | .unknown => .unknown
  | .tree tree =>
      if HasUnusableMode tree.files then
        .unknown
      else
        match input.approval with
        | none => .foreign tree.basis
        | some approval =>
            if ¬ CanonicalApproval approval then
              .unknown
            else if tree.root ≠ approval.root then
              .foreign tree.basis
            else if ¬ CaptureConsistent approval tree then
              .foreign tree.basis
            else if ApprovalFilesPresent approval tree then
              .complete ⟨approval.owner, approval.identity⟩ tree.basis
            else
              .partialPackage ⟨approval.owner, approval.identity⟩ tree.basis

def model : Interface := ⟨classify⟩

end PluginSdk.Installer.LocalPackage
