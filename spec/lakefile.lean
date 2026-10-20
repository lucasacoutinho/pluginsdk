import Lake
open Lake DSL

package pluginSdk where
  leanOptions := #[⟨`autoImplicit, false⟩, ⟨`relaxedAutoImplicit, false⟩]

@[default_target]
lean_lib PluginSdk

lean_exe oracle where
  root := `Oracle
