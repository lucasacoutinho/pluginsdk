import PluginSdk.Installer.Locks.Types

namespace PluginSdk.Installer.Locks

def ProjectSubjects (subjects : List Subject) : List Subject :=
  subjects.filterMap fun subject => match subject with
    | .home _ => none
    | .project root => some (.project root)

def HomeRoots (subjects : List Subject) : List String :=
  subjects.filterMap fun subject => match subject with
    | .home root => some root
    | .project _ => none

def Scope.home : Scope → String
  | .user home => home
  | .project home _ => home

def IL1_user_exact (model : Interface) : Prop :=
  ∀ home, model.subjects (.user home) = [.home home]

def IL2_project_exact (model : Interface) : Prop :=
  ∀ home root, model.subjects (.project home root) = [.home home, .project root]

def IL3_same_project_subject_across_homes (model : Interface) : Prop :=
  ∀ home₁ home₂ root,
    ProjectSubjects (model.subjects (.project home₁ root)) =
      ProjectSubjects (model.subjects (.project home₂ root))

def IL4_exactly_one_home_first_input_home (model : Interface) : Prop :=
  ∀ scope, ∃ rest,
    model.subjects scope = .home scope.home :: rest ∧
      HomeRoots (model.subjects scope) = [scope.home]

end PluginSdk.Installer.Locks
