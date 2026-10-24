import PluginSdk.ExecutableIntent.Rules

namespace PluginSdk.ExecutableIntent

def EI1_permission_semantics (model : Interface) : Prop :=
  ∀ bits, model.permissions bits = decide (HasExecute bits)

def EI2_filesystem_resolution_exact (model : Interface) : Prop :=
  ∀ files resolved, model.source (.filesystem files) = .resolved resolved ↔
    (files.map (·.path)).Nodup ∧ NativeAssignments files resolved

def EI3_declaration_resolution_exact (model : Interface) : Prop :=
  ∀ files executables resolved, model.source (.declared files executables) = .resolved resolved ↔
    DeclaredReady files executables ∧ resolved = DeclaredFiles files executables

def EI4_source_paths_preserved (model : Interface) : Prop :=
  ∀ input resolved, model.source input = .resolved resolved → resolved.map (·.path) = input.paths

def EI5_unusable_source_modes_refuse (model : Interface) : Prop :=
  ∀ files file resolved, file ∈ files → ModeUnusable file.mode →
    model.source (.filesystem files) ≠ .resolved resolved

def EI6_duplicate_source_paths_refuse (model : Interface) : Prop :=
  ∀ input resolved, ¬ input.paths.Nodup → model.source input ≠ .resolved resolved

def EI7_invalid_declarations_refuse (model : Interface) : Prop :=
  ∀ files executables resolved,
    (¬ executables.Nodup ∨ ∃ path ∈ executables, path ∉ files) →
      model.source (.declared files executables) ≠ .resolved resolved

def EI8_declaration_membership_exact (model : Interface) : Prop :=
  ∀ files executables resolved file, model.source (.declared files executables) = .resolved resolved →
    file ∈ resolved → file.executable = executables.contains file.path

def EI9_declaration_order_independent (model : Interface) : Prop :=
  ∀ files executables other, DeclaredReady files executables → executables.Perm other →
    model.source (.declared files executables) = model.source (.declared files other)

def EI10_payload_resolution_exact (model : Interface) : Prop :=
  ∀ input executable, model.payload input = .resolved executable ↔
    PayloadReady input ∧ executable = input.retained.executable

def EI11_payload_binding_refuses (model : Interface) : Prop :=
  ∀ input executable, ¬ Bound input → model.payload input ≠ .resolved executable

def EI12_payload_native_drift_refuses (model : Interface) : Prop :=
  ∀ input before after executable, input.observed.mode = .posix before after →
    (before ≠ after ∨ input.retained.executable ≠ decide (HasExecute before)) →
      model.payload input ≠ .resolved executable

def EI13_unrepresented_intent_preserved (model : Interface) : Prop :=
  ∀ input, Bound input → input.observed.mode = .unrepresented →
    model.payload input = .resolved input.retained.executable

def EI14_unavailable_payload_refuses (model : Interface) : Prop :=
  ∀ input executable, input.observed.mode = .unavailable → model.payload input ≠ .resolved executable

def EI15_source_refusal_witness (model : Interface) : Prop :=
  ∀ input reason path, model.source input = .refused reason path → SourceFault input reason path

def EI16_payload_refusal_witness (model : Interface) : Prop :=
  ∀ input reason, model.payload input = .refused reason → PayloadFault input reason

def EI17_stage_intent_exact (model : Interface) : Prop :=
  ∀ bits executable, model.permissions (model.stage bits executable) = executable

def EI18_stage_data_bits_preserved (model : Interface) : Prop :=
  ∀ bits executable, DataPermissions (model.stage bits executable) = DataPermissions bits

def EI19_stage_matching_bits_preserved (model : Interface) : Prop :=
  ∀ bits executable, model.permissions bits = executable → model.stage bits executable = bits

def EI20_stage_owner_bit_only (model : Interface) : Prop :=
  ∀ bits, ¬ HasExecute bits → (model.stage bits true).val = bits.val + 64

end PluginSdk.ExecutableIntent
