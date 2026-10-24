import PluginSdk.Compiler.Process.Portable.AdmissionProofs
import PluginSdk.Compiler.Process.Portable.SemanticProofs
import PluginSdk.Compiler.Process.Portable.CaptureProofs

namespace PluginSdk.Compiler.Process.Portable.Proofs

theorem PL2_complete_process : PL2_complete_process model := by
  intro input program root ambient accepted
  obtain ⟨_, rfl⟩ := (rendered_iff input program).mp accepted
  exact complete_process input.plan root ambient

theorem PL3_missing_source_stops : PL3_missing_source_stops model := by
  intro input program root ambient name accepted member missing
  obtain ⟨_, rfl⟩ := (rendered_iff input program).mp accepted
  exact missing_source_stops input.plan root ambient name member missing

theorem PL4_capture_names : PL4_capture_names model :=
  CaptureProofs.PL4_capture_names

end PluginSdk.Compiler.Process.Portable.Proofs
