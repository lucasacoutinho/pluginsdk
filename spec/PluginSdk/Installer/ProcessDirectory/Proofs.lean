import PluginSdk.Installer.ProcessDirectory.Properties
import PluginSdk.Installer.ProcessDirectory.Model

namespace PluginSdk.Installer.ProcessDirectory.Proofs

open Compiler.Process
open Compiler.Process.Portable.Runtime
open WindowsPath (utf16Units)

private theorem cwdDirectory_exact (input : Input) (directory : String) :
    cwdDirectory input = some directory ↔ DeclaredDirectory input directory := by
  constructor
  · intro resolved
    cases hcwd : input.script.cwd with
    | zero =>
      simp [cwdDirectory, hcwd] at resolved
      subst directory
      exact .implicitRoot hcwd
    | succ index =>
      cases hword : input.script.snapshot[index]? with
      | none => simp [cwdDirectory, hcwd, hword] at resolved
      | some word =>
        cases word with
        | literal value => simp [cwdDirectory, hcwd, hword] at resolved
        | root =>
          simp [cwdDirectory, hcwd, hword] at resolved
          subst directory
          exact .snapshotRoot index (by omega) hword
        | file path =>
          simp [cwdDirectory, hcwd, hword] at resolved
          subst directory
          exact .snapshotFile index path (by omega) hword
        | captured capture => simp [cwdDirectory, hcwd, hword] at resolved
  · intro declared
    cases declared with
    | implicitRoot hcwd =>
      cases h : input.script.cwd with
      | zero => simp [cwdDirectory, h]
      | succ index => simp [h] at hcwd
    | snapshotRoot foundIndex hcwd hword =>
      cases h : input.script.cwd with
      | zero => simp [h] at hcwd
      | succ index =>
        have sameIndex : foundIndex = index := by omega
        subst foundIndex
        simp [cwdDirectory, h, hword]
    | snapshotFile foundIndex path hcwd hword =>
      cases h : input.script.cwd with
      | zero => simp [h] at hcwd
      | succ index =>
        have sameIndex : foundIndex = index := by omega
        subst foundIndex
        simp [cwdDirectory, h, hword]

private theorem admit_accepted_exact (input : Input) (directory : String) :
    admit input = .accepted directory ↔
      cwdDirectory input = some directory ∧ utf16Units directory + 2 ≤ 260 := by
  cases hdirectory : cwdDirectory input with
  | none => simp [admit, hdirectory]
  | some candidate =>
    by_cases within : utf16Units candidate + 2 ≤ 260
    · simp [admit, hdirectory, within]
      intro same
      subst directory
      omega
    · simp [admit, hdirectory, within]
      intro same
      subst directory
      omega

private theorem cwdDirectory_none_exact (input : Input) :
    cwdDirectory input = none ↔ ¬ ∃ directory, DeclaredDirectory input directory := by
  constructor
  · intro unresolved ⟨directory, declared⟩
    have resolved := (cwdDirectory_exact input directory).2 declared
    rw [unresolved] at resolved
    contradiction
  · intro noDeclaration
    cases hdirectory : cwdDirectory input with
    | none => rfl
    | some directory =>
      exact False.elim (noDeclaration ⟨directory,
        (cwdDirectory_exact input directory).1 hdirectory⟩)

private theorem admit_unresolved_exact (input : Input) :
    admit input = .unresolved ↔ cwdDirectory input = none := by
  cases hdirectory : cwdDirectory input with
  | none => simp [admit, hdirectory]
  | some directory =>
    by_cases within : utf16Units directory + 2 ≤ 260
    · simp only [admit, hdirectory, ite_eq_left within]
      constructor <;> intro impossible <;> cases impossible
    · simp only [admit, hdirectory, ite_eq_right within]
      constructor <;> intro impossible <;> cases impossible

theorem PD1_admitted_exact : PD1_admitted_exact model := by
  intro input directory
  change admit input = .accepted directory ↔
    DeclaredDirectory input directory ∧ utf16Units directory + 2 ≤ 260
  rw [admit_accepted_exact]
  rw [cwdDirectory_exact]

theorem PD2_unresolved_exact : PD2_unresolved_exact model := by
  intro input
  change admit input = .unresolved ↔ ¬ ∃ directory, DeclaredDirectory input directory
  rw [admit_unresolved_exact, cwdDirectory_none_exact]

theorem PD3_capacity_refusal_exact : PD3_capacity_refusal_exact model := by
  intro input units
  change admit input = .tooLong units ↔
    ∃ directory, DeclaredDirectory input directory ∧ utf16Units directory = units ∧
      260 < units + 2
  cases hdirectory : cwdDirectory input with
  | none =>
    simp only [admit, hdirectory]
    constructor
    · intro impossible
      cases impossible
    · rintro ⟨directory, declared, _, _⟩
      have resolved := (cwdDirectory_exact input directory).2 declared
      rw [hdirectory] at resolved
      cases resolved
  | some directory =>
    by_cases within : utf16Units directory + 2 ≤ 260
    · simp [admit, hdirectory, within]
      rintro candidate declared unitsEqual
      have candidateEqual : candidate = directory := by
        injection ((cwdDirectory_exact input candidate).2 declared).symm.trans hdirectory
      subst candidate
      subst units
      omega
    · simp [admit, hdirectory, within]
      constructor
      · intro same
        refine ⟨directory, (cwdDirectory_exact input directory).1 hdirectory, same, ?_⟩
        omega
      · rintro ⟨candidate, declared, unitsEqual, exceeds⟩
        have candidateEqual : candidate = directory := by
          injection ((cwdDirectory_exact input candidate).2 declared).symm.trans hdirectory
        subst candidate
        subst units
        rfl

private theorem mapM_getElem
    {α β : Type} (resolve : α → Option β) (values : List α)
    (resolved : List β) (index : Nat) (value : α)
    (mapped : values.mapM resolve = some resolved)
    (atValue : values[index]? = some value) :
    resolved[index]? = resolve value := by
  induction values generalizing resolved index with
  | nil => simp at atValue
  | cons head tail ih =>
    cases index with
    | zero =>
      simp only [List.getElem?_cons_zero] at atValue
      have same : head = value := by injection atValue
      subst value
      simp only [List.mapM_cons] at mapped
      cases firstResult : resolve head with
      | none => simp [firstResult] at mapped
      | some first =>
        cases tailResult : tail.mapM resolve with
        | none => simp [firstResult, tailResult] at mapped
        | some rest =>
          have resolvedEq : resolved = first :: rest := by
            simpa [firstResult, tailResult] using mapped.symm
          subst resolved
          simp
    | succ offset =>
      simp only [List.getElem?_cons_succ] at atValue
      simp only [List.mapM_cons] at mapped
      cases firstResult : resolve head with
      | none => simp [firstResult] at mapped
      | some first =>
        cases tailResult : tail.mapM resolve with
        | none => simp [firstResult, tailResult] at mapped
        | some rest =>
          have resolvedEq : resolved = first :: rest := by
            simpa [firstResult, tailResult] using mapped.symm
          subst resolved
          simpa only [List.getElem?_cons_succ] using ih rest offset tailResult atValue

private theorem execute_cwd_parameter (input : Input)
    (ambient : EnvironmentName → Option String) (invocation : Launcher.Invocation)
    (executed : Portable.Runtime.execute input.script input.root ambient = some invocation) :
    ∃ snapshot,
      input.script.snapshot.mapM (Portable.Runtime.resolve input.root ambient) = some snapshot ∧
      (input.root :: snapshot)[input.script.cwd]? = some invocation.cwd := by
  unfold Portable.Runtime.execute at executed
  by_cases captureFailure :
      (input.script.captures.any (fun capture => (ambient capture.source).isNone)) = true
  · simp [captureFailure] at executed
  · have capturesPresent :
        (input.script.captures.any (fun capture => (ambient capture.source).isNone)) = false :=
      by
        cases result : input.script.captures.any
            (fun capture => (ambient capture.source).isNone) with
        | false => rfl
        | true => exact False.elim (captureFailure result)
    simp only [capturesPresent, Bool.false_eq_true] at executed
    cases mapped : input.script.snapshot.mapM (Portable.Runtime.resolve input.root ambient) with
    | none => simp [mapped] at executed
    | some snapshot =>
      let parameters := input.root :: snapshot
      cases commandPresent : parameters[input.script.command]? with
      | none => simp [mapped, parameters, commandPresent] at executed
      | some command =>
        cases argsPresent : input.script.args.mapM (fun index => parameters[index]?) with
        | none => simp [mapped, parameters, commandPresent, argsPresent] at executed
        | some args =>
          cases environmentPresent : input.script.environment.mapM (fun binding =>
              (parameters[binding.2]?).bind (fun value => some (binding.1, value))) with
          | none =>
            simp [mapped, parameters, commandPresent, argsPresent, environmentPresent] at executed
          | some environment =>
            cases cwdPresent : parameters[input.script.cwd]? with
            | none =>
              simp [mapped, parameters, commandPresent, argsPresent, environmentPresent,
                cwdPresent] at executed
            | some cwd =>
              have invocationEqual :
                  (⟨command, args, environment, cwd⟩ : Launcher.Invocation) = invocation := by
                have resultEqual :
                    (some (⟨command, args, environment, cwd⟩ : Launcher.Invocation) :
                      Option Launcher.Invocation) = some invocation := by
                  simpa [mapped, parameters, commandPresent, argsPresent, environmentPresent,
                    cwdPresent] using executed
                exact Option.some.inj resultEqual
              have cwdEqual : cwd = invocation.cwd := by
                exact congrArg Launcher.Invocation.cwd invocationEqual
              have cwdResult : parameters[input.script.cwd]? = some invocation.cwd := by
                simpa only [cwdEqual] using cwdPresent
              exact ⟨snapshot, rfl, cwdResult⟩

private theorem runtime_cwd_of_declared (input : Input)
    (ambient : EnvironmentName → Option String) (invocation : Launcher.Invocation)
    (directory : String) (declared : DeclaredDirectory input directory)
    (executed : Portable.Runtime.execute input.script input.root ambient = some invocation) :
    invocation.cwd = directory := by
  obtain ⟨snapshot, mapped, cwdPresent⟩ := execute_cwd_parameter input ambient invocation executed
  cases declared with
  | implicitRoot cwdZero =>
    have cwdRoot : (input.root :: snapshot)[0]? = some invocation.cwd := by
      simpa [cwdZero] using cwdPresent
    simp at cwdRoot
    exact cwdRoot.symm
  | snapshotRoot index cwdIndex snapshotRoot =>
    have resolvedRoot := mapM_getElem (Portable.Runtime.resolve input.root ambient)
      input.script.snapshot snapshot index .root mapped snapshotRoot
    have resolvedRoot : snapshot[index]? = some input.root := by
      simpa [Portable.Runtime.resolve] using resolvedRoot
    have cwdAtIndex : snapshot[index]? = some invocation.cwd := by
      simpa [cwdIndex, List.getElem?_cons_succ] using cwdPresent
    rw [resolvedRoot] at cwdAtIndex
    simp at cwdAtIndex
    exact cwdAtIndex.symm
  | snapshotFile index path cwdIndex snapshotFile =>
    have resolvedFile := mapM_getElem (Portable.Runtime.resolve input.root ambient)
      input.script.snapshot snapshot index (.file path) mapped snapshotFile
    have resolvedFile : snapshot[index]? = some (AtRoot input.root path) := by
      simpa [Portable.Runtime.resolve] using resolvedFile
    have cwdAtIndex : snapshot[index]? = some invocation.cwd := by
      simpa [cwdIndex, List.getElem?_cons_succ] using cwdPresent
    rw [resolvedFile] at cwdAtIndex
    simp at cwdAtIndex
    exact cwdAtIndex.symm

theorem PD4_runtime_cwd_exact : PD4_runtime_cwd_exact model := by
  intro input directory ambient invocation admitted executed
  have admittedDirectory : DeclaredDirectory input directory ∧ utf16Units directory + 2 ≤ 260 :=
    let projection := (admit_accepted_exact input directory).1 admitted
    ⟨(cwdDirectory_exact input directory).1 projection.1, projection.2⟩
  exact runtime_cwd_of_declared input ambient invocation directory admittedDirectory.1 executed

end PluginSdk.Installer.ProcessDirectory.Proofs
