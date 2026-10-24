import PluginSdk.WindowsPath.Rules

namespace PluginSdk.WindowsPath

def AdmissionFacts (input : Input) : Prop :=
  ¬ HasSyntax input.path ∧ ¬ HasDevice input.path ∧
    ComponentWithinLimits input ∧ PathWithinLimit input

def WP1_admission_exact (model : Interface) : Prop :=
  ∀ input, model.classify input = .accepted ↔ AdmissionFacts input

def WP2_syntax_exact (model : Interface) : Prop :=
  ∀ input, model.classify input = .syntax ↔ HasSyntax input.path

def WP3_device_exact (model : Interface) : Prop :=
  ∀ input, model.classify input = .device ↔
    ¬ HasSyntax input.path ∧ HasDevice input.path

def WP4_component_limit_exact (model : Interface) : Prop :=
  ∀ input, model.classify input = .componentLimit ↔
    ¬ HasSyntax input.path ∧ ¬ HasDevice input.path ∧ HasComponentOverflow input

def WP5_path_limit_exact (model : Interface) : Prop :=
  ∀ input, model.classify input = .pathLimit ↔
    ¬ HasSyntax input.path ∧ ¬ HasDevice input.path ∧
      ComponentWithinLimits input ∧ ¬ PathWithinLimit input

def WP6_capacity_monotone (model : Interface) : Prop :=
  ∀ (path : PluginSdk.PackagePath) (oldCapacity newCapacity : Capacity),
    oldCapacity.maxComponentUnits ≤ newCapacity.maxComponentUnits →
    oldCapacity.remainingPathUnits ≤ newCapacity.remainingPathUnits →
    model.classify ⟨path, oldCapacity⟩ = .accepted →
      model.classify ⟨path, newCapacity⟩ = .accepted

def WP7_colon_refuses (model : Interface) : Prop :=
  ∀ input,
    (∃ component, component ∈ components input.path ∧ ':' ∈ component.toList) →
      model.classify input ≠ .accepted

def WP8_accepted_limits (model : Interface) : Prop :=
  ∀ input, model.classify input = .accepted →
    ComponentWithinLimits input ∧ PathWithinLimit input

private def supplementaryPath : PluginSdk.PackagePath :=
  ⟨"😀", by
    refine ⟨"😀", [], ?_, ?_, ?_, ?_⟩
    · simp
    · simp [PluginSdk.SafeSegment]
    · simp
    · simp [PluginSdk.NoDrive]⟩

def WP9_supplementary_boundary (model : Interface) : Prop :=
  model.classify ⟨supplementaryPath, ⟨2, 2⟩⟩ = .accepted ∧
  model.classify ⟨supplementaryPath, ⟨1, 2⟩⟩ = .componentLimit ∧
  model.classify ⟨supplementaryPath, ⟨2, 1⟩⟩ = .pathLimit

def WP10_root_capacity_exact (model : Interface) : Prop :=
  ∀ input, RootCapacityFacts input (model.rootCapacity input)

def WP11_complete_names_fit (model : Interface) : Prop :=
  ∀ input capacity path,
    model.rootCapacity input = .available capacity →
    model.classify ⟨path, capacity⟩ = .accepted →
    ∀ view, view ∈ input.views →
      utf16Units (nativeName view.root path) ≤ view.maxPathBufferUnits

def WP12_root_budget_greatest (model : Interface) : Prop :=
  ∀ input capacity candidate,
    model.rootCapacity input = .available capacity →
    (∀ view, view ∈ input.views →
      rootOverhead view.root + candidate ≤ view.maxPathBufferUnits) →
    candidate ≤ capacity.remainingPathUnits

def WP13_root_capacity_monotone (model : Interface) : Prop :=
  ∀ oldInput newInput oldCapacity,
    oldInput.maxComponentUnits ≤ newInput.maxComponentUnits →
    (∀ newView, newView ∈ newInput.views →
      ∃ oldView, oldView ∈ oldInput.views ∧ oldView.root = newView.root ∧
        oldView.maxPathBufferUnits ≤ newView.maxPathBufferUnits) →
    model.rootCapacity oldInput = .available oldCapacity →
    ∃ newCapacity, model.rootCapacity newInput = .available newCapacity ∧
      oldCapacity.maxComponentUnits ≤ newCapacity.maxComponentUnits ∧
      oldCapacity.remainingPathUnits ≤ newCapacity.remainingPathUnits

def WP14_root_view_order_independent (model : Interface) : Prop :=
  ∀ oldInput newInput,
    oldInput.maxComponentUnits = newInput.maxComponentUnits →
    oldInput.views.Perm newInput.views →
    model.rootCapacity oldInput = model.rootCapacity newInput

def WP15_native_exact_matches (model : Interface) : Prop :=
  ∀ platform path, model.matchesNativePath ⟨platform, path, path⟩ = true

def WP16_native_other_platform_exact (model : Interface) : Prop :=
  ∀ input, input.platform ≠ "win32" →
    (model.matchesNativePath input = true ↔ input.reported = input.expected)

def WP17_native_admission_exact (model : Interface) : Prop :=
  ∀ input, model.matchesNativePath input = true ↔ NativePathFacts input

def WP18_native_unsafe_has_no_alias (model : Interface) : Prop :=
  ∀ input, ordinaryDosPath input.expected = false →
    (model.matchesNativePath input = true ↔ input.reported = input.expected)

def WP19_native_other_path_refused (model : Interface) : Prop :=
  ∀ input, input.reported ≠ input.expected →
    input.reported ≠ extendedDosPath input.expected → model.matchesNativePath input = false

def WP20_native_extended_matches (model : Interface) : Prop :=
  ∀ path, ordinaryDosPath path = true →
    model.matchesNativePath ⟨"win32", path, extendedDosPath path⟩ = true

end PluginSdk.WindowsPath
