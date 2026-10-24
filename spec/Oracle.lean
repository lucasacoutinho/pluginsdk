import PluginSdk.Lifecycle.Wire
import PluginSdk.Compiler.Wire
import PluginSdk.Compiler.Bundle.Wire
import PluginSdk.Compiler.Assembly.Wire
import PluginSdk.Compiler.Process.QuoteWire
import PluginSdk.Compiler.Process.Wire
import PluginSdk.Compiler.Process.LauncherWire
import PluginSdk.Compiler.Process.Portable.Wire
import PluginSdk.Compiler.Process.Portable.Runtime.Wire
import PluginSdk.Compiler.BuildFormat.Wire
import PluginSdk.Compiler.Mcp.Wire
import PluginSdk.Compiler.Mcp.Portable.Wire
import PluginSdk.Compiler.Hooks.Wire
import PluginSdk.Compiler.Hooks.Binding.Wire
import PluginSdk.Compiler.Hooks.Portable.Wire
import PluginSdk.Compiler.Portable.Wire
import PluginSdk.Repair.Wire
import PluginSdk.Authorization.Wire
import PluginSdk.Catalog.Wire
import PluginSdk.Catalog.Artifacts.Wire
import PluginSdk.Catalog.Tools.Wire
import PluginSdk.Distribution.Wire
import PluginSdk.Compatibility.Wire
import PluginSdk.Compatibility.ClientPackages.Wire
import PluginSdk.Project.Preview.Wire
import PluginSdk.Compiler.Agents.Wire
import PluginSdk.Installer.Companions.Wire
import PluginSdk.Installer.CompanionFile.Wire
import PluginSdk.Installer.ProjectConfig.Wire
import PluginSdk.Installer.ProjectActivation.Wire
import PluginSdk.Installer.Locks.Wire
import PluginSdk.Installer.LauncherRuntime.Wire
import PluginSdk.Installer.ProcessDirectory.Wire
import PluginSdk.Installer.ProjectFile.Wire
import PluginSdk.Installer.LocalSlot.Wire
import PluginSdk.Installer.LocalPackage.Wire
import PluginSdk.Installer.LocalApproval.Wire
import PluginSdk.Installer.LocalObservation.Wire
import PluginSdk.Installer.Execution.Wire
import PluginSdk.Installer.Worker.Wire
import PluginSdk.Installer.Writers.Wire
import PluginSdk.Installer.WindowsCommand.Wire
import PluginSdk.Installer.WindowsCommand.StreamWire
import PluginSdk.Publication.Wire
import PluginSdk.FileRead.Wire
import PluginSdk.WindowsPath.Wire
import PluginSdk.TreeRead.Wire
import PluginSdk.ExecutableIntent.Wire

private def evaluate (request : Lean.Json) : Except String Lean.Json := do
  match ← (← request.getObjVal? "type").getStr? with
  | "render" => PluginSdk.Compiler.Wire.evaluate request
  | "check_bundle" => PluginSdk.Compiler.Bundle.Wire.evaluate request
  | "assemble" => PluginSdk.Compiler.Assembly.Wire.evaluate request
  | "quote_process_text" => PluginSdk.Compiler.Process.Quoting.Wire.evaluate request
  | "quote_windows_argument" => PluginSdk.Installer.WindowsCommand.Quoting.Wire.evaluate request
  | "windows_stream_step" | "windows_io_step" => PluginSdk.Installer.WindowsCommand.Streams.Wire.evaluate request
  | "lower_process" => PluginSdk.Compiler.Process.Wire.evaluate request
  | "render_launcher" => PluginSdk.Compiler.Process.Launcher.Wire.evaluate request
  | "compile_portable_launcher" => PluginSdk.Compiler.Process.Portable.Wire.evaluate request
  | "read_process_capture" | "execute_process" => PluginSdk.Compiler.Process.Portable.Runtime.Wire.evaluate request
  | "select_build_format" => PluginSdk.Compiler.BuildFormat.Wire.evaluate request
  | "client_package_host" | "normalize_build_clients" =>
    PluginSdk.Compatibility.ClientPackages.Wire.evaluate request
  | "preview_route" | "preview_apply" | "preview_finish" => PluginSdk.Project.Preview.Wire.evaluate request
  | "render_mcp" => PluginSdk.Compiler.Mcp.Wire.evaluate request
  | "render_portable_mcp" => PluginSdk.Compiler.Mcp.Portable.Wire.evaluate request
  | "render_hooks" => PluginSdk.Compiler.Hooks.Wire.evaluate request
  | "bind_hook" => PluginSdk.Compiler.Hooks.Binding.Wire.evaluate request
  | "render_portable_hooks" => PluginSdk.Compiler.Hooks.Portable.Wire.evaluate request
  | "render_portable_features" => PluginSdk.Compiler.Portable.Wire.evaluate request
  | "render_agents" => PluginSdk.Compiler.Agents.Wire.evaluate request
  | "review_companions" => PluginSdk.Installer.Companions.Wire.evaluate request
  | "admit_companion_file" | "review_companion_file" | "observe_companion_file" =>
    PluginSdk.Installer.CompanionFile.Wire.evaluate request
  | "edit_project_config" => PluginSdk.Installer.ProjectConfig.Wire.evaluate request
  | "build_project_activation" | "review_project_role_authority" => PluginSdk.Installer.ProjectActivation.Wire.evaluate request
  | "installation_lock_subjects" => PluginSdk.Installer.Locks.Wire.evaluate request
  | "launcher_runtime_checks" | "accept_node_runtime" => PluginSdk.Installer.LauncherRuntime.Wire.evaluate request
  | "admit_process_directory" => PluginSdk.Installer.ProcessDirectory.Wire.evaluate request
  | "admit_project_file" | "review_project_file" => PluginSdk.Installer.ProjectFile.Wire.evaluate request
  | "advance_local_slot" | "cleanup_local_slots" => PluginSdk.Installer.LocalSlot.Wire.evaluate request
  | "classify_local_package" => PluginSdk.Installer.LocalPackage.Wire.evaluate request
  | "bind_local_approval" => PluginSdk.Installer.LocalApproval.Wire.evaluate request
  | "observe_local_slots" => PluginSdk.Installer.LocalObservation.Wire.evaluate request
  | "execution_domain_status" => PluginSdk.Installer.Execution.Wire.evaluate request
  | "admit_worker_request" => PluginSdk.Installer.Worker.Wire.evaluate request
  | "writer_step" | "writer_completion" | "writer_observation" | "writer_prior_owners" => PluginSdk.Installer.Writers.Wire.evaluate request
  | "publish_release" => PluginSdk.Publication.Wire.evaluate request
  | "file_path" | "file_containment" | "file_read" => PluginSdk.FileRead.Wire.evaluate request
  | "windows_path" | "windows_root_capacity" | "native_path_match" => PluginSdk.WindowsPath.Wire.evaluate request
  | "tree_entry" | "tree_directory" => PluginSdk.TreeRead.Wire.evaluate request
  | "source_intent" | "payload_intent" | "stage_permissions" => PluginSdk.ExecutableIntent.Wire.evaluate request
  | "repair_propose" | "repair_begin" | "repair_settle" => PluginSdk.Repair.Wire.evaluate request
  | "authorize" => PluginSdk.Authorization.Wire.evaluate request
  | "catalog_register" | "catalog_resolve" => PluginSdk.Catalog.Wire.evaluate request
  | "check_packages" => PluginSdk.Catalog.Artifacts.Wire.evaluate request
  | "normalize_tools" | "check_contract_binding" => PluginSdk.Catalog.Tools.Wire.evaluate request
  | "select_distribution_format" | "normalize_distribution" | "open_distribution"
  | "schedule_distribution" | "record_distribution" | "summarize_distribution" =>
    PluginSdk.Distribution.Wire.evaluate request
  | "select_native_profile" | "native_ownership_compatible" => PluginSdk.Compatibility.Wire.evaluate request
  | _ => PluginSdk.Lifecycle.Wire.evaluate request

def main : IO UInt32 := do
  let input ← IO.getStdin
  let output ← IO.getStdout
  let errors ← IO.getStderr
  repeat
    let line ← input.getLine
    if line.isEmpty then return 0
    match PluginSdk.WireJson.parse line >>= evaluate with
    | .ok response =>
      output.putStrLn response.compress
      output.flush
    | .error message =>
      errors.putStrLn s!"oracle: {message}"
      return 1
