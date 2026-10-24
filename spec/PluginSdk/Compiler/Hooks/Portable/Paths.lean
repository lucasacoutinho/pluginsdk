import PluginSdk.Compiler.Hooks.Types
import PluginSdk.Compiler.Hooks.Binding.Types
import PluginSdk.Compiler.Process.Portable.Files

namespace PluginSdk.Compiler.Hooks.Portable

open PluginSdk.Compiler

abbrev dataPath := _root_.PluginSdk.Compiler.Hooks.Binding.dataPath

abbrev shellPath := _root_.PluginSdk.Compiler.Hooks.launcherPath

abbrev runtimeFile := _root_.PluginSdk.Compiler.Process.Portable.runtimeFile

theorem dataPath_value (ordinal : Nat) :
    (dataPath ordinal).value = ".psdk/hooks/" ++ Nat.repr ordinal ++ ".json" := by
  simp [dataPath, _root_.PluginSdk.Compiler.Hooks.Binding.dataPath,
    _root_.PluginSdk.Compiler.Generated.dataPath_value,
    _root_.PluginSdk.Compiler.Generated.directory]

theorem shellPath_value (ordinal : Nat) :
    (shellPath ordinal).value = ".psdk/hooks/" ++ Nat.repr ordinal ++ ".sh" := by
  simp [shellPath, _root_.PluginSdk.Compiler.Hooks.launcherPath,
    _root_.PluginSdk.Compiler.Generated.launcherPath_value,
    _root_.PluginSdk.Compiler.Generated.directory]

theorem runtimeFile_value :
    runtimeFile.value = _root_.PluginSdk.Compiler.Process.Portable.runtimePath :=
  _root_.PluginSdk.Compiler.Process.Portable.runtimeFile_value

theorem dataPath_no_dollar (ordinal : Nat) :
    '$' ∉ (dataPath ordinal).value.toList :=
  _root_.PluginSdk.Compiler.Generated.dataPath_no_dollar .hooks ordinal

theorem shellPath_no_dollar (ordinal : Nat) :
    '$' ∉ (shellPath ordinal).value.toList :=
  _root_.PluginSdk.Compiler.Generated.launcherPath_no_dollar .hooks ordinal

theorem runtimeFile_no_dollar :
    '$' ∉ runtimeFile.value.toList :=
  _root_.PluginSdk.Compiler.Process.Portable.runtimeFile_no_dollar

theorem dataPath_value_injective {left right : Nat}
    (equal : (dataPath left).value = (dataPath right).value) : left = right :=
  _root_.PluginSdk.Compiler.Generated.dataPath_value_injective .hooks equal

theorem shellPath_value_injective {left right : Nat}
    (equal : (shellPath left).value = (shellPath right).value) : left = right :=
  _root_.PluginSdk.Compiler.Generated.launcherPath_value_injective .hooks equal

theorem dataPath_ne_shellPath (left right : Nat) :
    (dataPath left).value ≠ (shellPath right).value := by
  intro equal
  have chars := congrArg String.toList equal
  simp only [dataPath_value, shellPath_value, String.toList_append,
    List.append_assoc] at chars
  have tails := List.append_cancel_left chars
  have endings := congrArg List.getLast? tails
  simp at endings

theorem dataPath_ne_runtimeFile (ordinal : Nat) :
    (dataPath ordinal).value ≠ runtimeFile.value := by
  intro equal
  have chars := congrArg String.toList equal
  have atDirectory := congrArg (fun value : List Char => value[6]!) chars
  simp [dataPath_value, runtimeFile_value,
    _root_.PluginSdk.Compiler.Process.Portable.runtimePath] at atDirectory

theorem shellPath_ne_runtimeFile (ordinal : Nat) :
    (shellPath ordinal).value ≠ runtimeFile.value := by
  intro equal
  have chars := congrArg String.toList equal
  have atDirectory := congrArg (fun value : List Char => value[6]!) chars
  simp [shellPath_value, runtimeFile_value,
    _root_.PluginSdk.Compiler.Process.Portable.runtimePath] at atDirectory

end PluginSdk.Compiler.Hooks.Portable
