import PluginSdk.Distribution.Selection.Model
import PluginSdk.Distribution.Planning.Model
import PluginSdk.Distribution.Execution.Model
import PluginSdk.Catalog.Artifacts.Types
import PluginSdk.Catalog.Wire

namespace PluginSdk.Distribution.Wire

open Lean (Json)
open WireJson

private def readNonemptyArray {α : Type} (read : Json → Except String α)
    (json : Json) : Except String (NonemptyList α) := do
  match ← (← json.getArr?).toList.mapM read with
  | [] => throw "expected a nonempty array"
  | head :: tail => return ⟨head, tail⟩

private def readTargetId (json : Json) : Except String TargetId := do
  return ⟨← Catalog.Wire.readNonempty json⟩

private def readDesired (json : Json) : Except String Desired := do
  match ← json.getStr? with
  | "present" => return .present
  | "absent" => return .absent
  | value => throw s!"unknown desired presence: {value}"

private def writeDesired : Desired → Json
  | .present => .str "present"
  | .absent => .str "absent"

private def readStep (json : Json) : Except String StepDescriptor := do
  checkFields json ["target", "installation", "digest"]
  return ⟨← readTargetId (← json.getObjVal? "target"),
    ⟨← Catalog.Wire.readNonempty (← json.getObjVal? "installation")⟩,
    ⟨← readHex (← json.getObjVal? "digest")⟩⟩

private def writeStep (step : StepDescriptor) : Json := Json.mkObj [
  ("target", .str step.target.value),
  ("installation", .str step.installation.value),
  ("digest", .str step.digest.value)
]

private def readSelectionInput (json : Json) : Except String Selection.Input := do
  checkFields json ["host", "formats"]
  let host ← match ← (← json.getObjVal? "host").getStr? with
    | "claude_code" => pure PluginSdk.Compatibility.ClientPackages.Client.claudeCode
    | "codex" => pure PluginSdk.Compatibility.ClientPackages.Client.codex
    | "cursor" => pure PluginSdk.Compatibility.ClientPackages.Client.cursor
    | value => throw s!"unknown qualified local host: {value}"
  return ⟨host, ← (← (← json.getObjVal? "formats").getArr?).toList.mapM Catalog.Wire.readPackageFormat⟩

private def writeSelection : Selection.Result → Json
  | .selected format => tagged "selected" [("format", .str (Catalog.Artifacts.FormatKey format))]
  | .unavailable => tagged "blocked" [("reason", .str "unavailable")]
  | .ambiguous => tagged "blocked" [("reason", .str "ambiguous")]

private def readFailure (json : Json) : Except String Planning.Failure := do
  match ← json.getStr? with
  | "wrong_organization" => return .wrongOrganization
  | "workspace_unqualified" => return .workspaceUnqualified
  | "mcp_registration_unqualified" => return .mcpRegistrationUnqualified
  | "release_unavailable" => return .releaseUnavailable
  | "release_mismatch" => return .releaseMismatch
  | "package_unavailable" => return .packageUnavailable
  | "package_ambiguous" => return .packageAmbiguous
  | "package_rejected" => return .packageRejected
  | "destination_unsupported" => return .destinationUnsupported
  | "host_unavailable" => return .hostUnavailable
  | "installation_unavailable" => return .installationUnavailable
  | "pending_operation" => return .pendingOperation
  | "unowned" => return .unowned
  | "drift" => return .drift
  | "unknown" => return .unknown
  | value => throw s!"unknown planning failure: {value}"

private def readCandidate (json : Json) : Except String Planning.Candidate := do
  match ← (← json.getObjVal? "type").getStr? with
  | "ready" =>
    checkFields json ["type", "step"]
    return .ready (← readStep (← json.getObjVal? "step"))
  | "blocked" =>
    checkFields json ["type", "target", "reason"]
    return .blocked (← readTargetId (← json.getObjVal? "target"))
      (← readFailure (← json.getObjVal? "reason"))
  | value => throw s!"unknown planning candidate: {value}"

private def readNormalizationInput (json : Json) : Except String (NonemptyList Planning.Candidate) := do
  checkFields json ["candidates"]
  readNonemptyArray readCandidate (← json.getObjVal? "candidates")

private def writeIssue : Planning.Issue → Json
  | .blocked target reason => tagged "blocked" [
      ("target", .str target.value), ("reason", .str (Planning.FailureName reason))]
  | .duplicateTarget target => tagged "duplicate_target" [("target", .str target.value)]
  | .duplicateInstallation installation => tagged "duplicate_installation" [
      ("installation", .str installation.value)]

private def writeNormalization : Planning.Result → Json
  | .ready steps => tagged "ready" [("steps", .arr (steps.toList.map writeStep).toArray)]
  | .blocked issues => tagged "blocked" [("issues", .arr (issues.toList.map writeIssue).toArray)]

private def readStatus (json : Json) : Except String Execution.Status := do
  match ← json.getStr? with
  | "pending" => return .pending
  | "installed" => return .installed
  | "removed" => return .removed
  | "unchanged" => return .unchanged
  | "not_applied" => return .notApplied
  | "blocked" => return .blocked
  | "uncertain" => return .uncertain
  | "unavailable" => return .unavailable
  | value => throw s!"unknown progress status: {value}"

private def writeStatus : Execution.Status → Json
  | .pending => .str "pending"
  | .installed => .str "installed"
  | .removed => .str "removed"
  | .unchanged => .str "unchanged"
  | .notApplied => .str "not_applied"
  | .blocked => .str "blocked"
  | .uncertain => .str "uncertain"
  | .unavailable => .str "unavailable"

private def readAttemptStatus (json : Json) : Except String Execution.AttemptStatus := do
  match ← readStatus json with
  | .pending => throw "pending is not an attempt outcome"
  | .installed => return .installed
  | .removed => return .removed
  | .unchanged => return .unchanged
  | .notApplied => return .notApplied
  | .blocked => return .blocked
  | .uncertain => return .uncertain
  | .unavailable => return .unavailable

private def readEntry (json : Json) : Except String Execution.Entry := do
  checkFields json ["step", "status"]
  return ⟨← readStep (← json.getObjVal? "step"), ← readStatus (← json.getObjVal? "status")⟩

private def writeEntry (entry : Execution.Entry) : Json := Json.mkObj [
  ("step", writeStep entry.step), ("status", writeStatus entry.status)
]

private def readProgress (json : Json) : Except String Execution.Progress := do
  checkFields json ["id", "desired", "entries"]
  return ⟨⟨← readHex (← json.getObjVal? "id")⟩, ← readDesired (← json.getObjVal? "desired"),
    ← readNonemptyArray readEntry (← json.getObjVal? "entries")⟩

private def writeProgress (record : Execution.Progress) : Json := Json.mkObj [
  ("id", .str record.id.value),
  ("desired", writeDesired record.desired),
  ("entries", .arr (record.entries.toList.map writeEntry).toArray)
]

private def readPlan (json : Json) : Except String Execution.Plan := do
  checkFields json ["id", "desired", "steps"]
  return ⟨⟨← readHex (← json.getObjVal? "id")⟩, ← readDesired (← json.getObjVal? "desired"),
    ← readNonemptyArray readStep (← json.getObjVal? "steps")⟩

private def readOpenInput (json : Json) : Except String Execution.OpenInput := do
  checkFields json ["plan", "prior"]
  return ⟨← readPlan (← json.getObjVal? "plan"),
    ← readOptional readProgress (← json.getObjVal? "prior")⟩

private def writeOpenResult : Execution.OpenResult → Json
  | .opened record => tagged "opened" [("record", writeProgress record)]
  | .planConflict => tagged "rejected" [("reason", .str "plan_conflict")]

private def readScheduleInput (json : Json) : Except String Execution.ScheduleInput := do
  checkFields json ["record", "visited"]
  return ⟨← readProgress (← json.getObjVal? "record"),
    ← (← (← json.getObjVal? "visited").getArr?).toList.mapM readTargetId⟩

private def writeSchedule : Execution.ScheduleResult → Json
  | .attempt step => tagged "attempt" [("step", writeStep step)]
  | .idle => tagged "idle"

private def readRecordInput (json : Json) : Except String Execution.RecordInput := do
  checkFields json ["record", "target", "status"]
  return ⟨← readProgress (← json.getObjVal? "record"),
    ← readTargetId (← json.getObjVal? "target"),
    ← readAttemptStatus (← json.getObjVal? "status")⟩

private def writeRecordResult : Execution.RecordResult → Json
  | .recorded record => tagged "recorded" [("record", writeProgress record)]
  | .stepMissing => tagged "rejected" [("reason", .str "step_missing")]
  | .stepTerminal => tagged "rejected" [("reason", .str "step_terminal")]

private def readSummaryInput (json : Json) : Except String Execution.Progress := do
  checkFields json ["record"]
  readProgress (← json.getObjVal? "record")

private def writeSummary : Execution.Summary → Json
  | .complete => .str "complete"
  | .incomplete => .str "partial"

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let schema ← (← request.getObjVal? "schema").getNum?
  unless schema.toFloat == (1.0 : Float) do throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "select_distribution_format" => do
      pure (writeSelection (Selection.model.select (← readSelectionInput input)))
    | "normalize_distribution" => do
      pure (writeNormalization (Planning.model.normalize (← readNormalizationInput input)))
    | "open_distribution" => do
      pure (writeOpenResult (Execution.model.openRecord (← readOpenInput input)))
    | "schedule_distribution" => do
      pure (writeSchedule (Execution.model.schedule (← readScheduleInput input)))
    | "record_distribution" => do
      pure (writeRecordResult (Execution.model.record (← readRecordInput input)))
    | "summarize_distribution" => do
      pure (writeSummary (Execution.model.summarize (← readSummaryInput input)))
    | value => throw s!"unknown distribution request: {value}"
  return Json.mkObj [("schema", 1), ("type", .str tag), ("output", output)]

end PluginSdk.Distribution.Wire
