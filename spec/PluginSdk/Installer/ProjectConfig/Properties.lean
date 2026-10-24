import PluginSdk.Installer.ProjectConfig.Types

namespace PluginSdk.Installer.ProjectConfig

def J1_accepts_exactly_safe (model : Interface) : Prop :=
  ∀ input, Safe input ↔ ∃ document, model.edit input = .ready document

def J2_block_reason_exact (model : Interface) : Prop :=
  ∀ input reason, model.edit input = .blocked reason ↔ RequiredReason input reason

def J3_foreign_bytes_preserved (model : Interface) : Prop :=
  ∀ input document, model.edit input = .ready document →
    Foreign input.key document = Foreign input.key input.document

def J4_desired_block_exact (model : Interface) : Prop :=
  ∀ input document, model.edit input = .ready document →
    Owned input.key document = input.desired.toList

def J5_unchanged_retains_document (model : Interface) : Prop :=
  ∀ input, Safe input → input.previous = input.desired →
    model.edit input = .ready input.document

def J6_completed_edit_is_idempotent (model : Interface) : Prop :=
  ∀ input document, model.edit input = .ready document →
    model.edit { input with previous := input.desired, document := document } = .ready document

end PluginSdk.Installer.ProjectConfig
