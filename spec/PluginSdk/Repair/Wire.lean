import PluginSdk.Repair.Model
import PluginSdk.WireJson

namespace PluginSdk.Repair.Wire

open Lean (Json)
open WireJson

private def readPlanId (json : Json) : Except String PlanId :=
  PlanId.mk <$> readHex json

private def readFingerprint (json : Json) : Except String Fingerprint :=
  Fingerprint.mk <$> readHex json

private def readResidual (json : Json) : Except String Residual := do
  match ← json.getStr? with
  | "absent" => pure .absent
  | "marketplace" => pure .marketplace
  | value => throw s!"unknown repair residual: {value}"

private def readSnapshot (json : Json) : Except String Snapshot := do
  checkFields json ["fingerprint", "residual"]
  return ⟨← readFingerprint (← json.getObjVal? "fingerprint"),
    ← readResidual (← json.getObjVal? "residual")⟩

private def readBasis (json : Json) : Except String Basis := do
  checkFields json ["interrupted", "pending", "observed"]
  return ⟨← readPlanId (← json.getObjVal? "interrupted"),
    ← readPlanId (← json.getObjVal? "pending"),
    ← readSnapshot (← json.getObjVal? "observed")⟩

private def readPending (json : Json) : Except String Pending := do
  checkFields json ["type", "plan", "before"]
  unless (← (← json.getObjVal? "type").getStr?) == "repair_pending" do
    throw "expected a repair_pending state"
  return ⟨← readPlanId (← json.getObjVal? "plan"),
    ← readBasis (← json.getObjVal? "before")⟩

private def readState (json : Json) : Except String State := do
  match ← (← json.getObjVal? "type").getStr? with
  | "operation_pending" =>
    checkFields json ["type", "plan"]
    return .operationPending (← readPlanId (← json.getObjVal? "plan"))
  | "repair_pending" => .repairPending <$> readPending json
  | "complete" =>
    checkFields json ["type", "plan"]
    return .complete (← readPlanId (← json.getObjVal? "plan"))
  | tag => throw s!"unknown repair state: {tag}"

private def readConflict (json : Json) : Except String Conflict := do
  match ← json.getStr? with
  | "unknown" => pure .unknown
  | "unowned" => pure .unowned
  | "drift" => pure .drift
  | reason => throw s!"unknown repair conflict: {reason}"

private def readInspection (json : Json) : Except String Inspection := do
  match ← (← json.getObjVal? "type").getStr? with
  | "recoverable" =>
    checkFields json ["type", "state"]
    return .recoverable (← readSnapshot (← json.getObjVal? "state"))
  | "blocked" =>
    checkFields json ["type", "reason"]
    return .blocked (← readConflict (← json.getObjVal? "reason"))
  | tag => throw s!"unknown repair inspection: {tag}"

private def readProposalInput (json : Json) : Except String ProposalInput := do
  checkFields json ["state", "observed"]
  return ⟨← readState (← json.getObjVal? "state"),
    ← readInspection (← json.getObjVal? "observed")⟩

private def readBeginInput (json : Json) : Except String BeginInput := do
  checkFields json ["state", "observed", "plan", "before"]
  return ⟨← readState (← json.getObjVal? "state"),
    ← readInspection (← json.getObjVal? "observed"),
    ← readPlanId (← json.getObjVal? "plan"),
    ← readBasis (← json.getObjVal? "before")⟩

private def readSettleInput (json : Json) : Except String SettleInput := do
  checkFields json ["state", "observed"]
  return ⟨← readPending (← json.getObjVal? "state"),
    ← readInspection (← json.getObjVal? "observed")⟩

private def writeSnapshot (state : Snapshot) : Json :=
  Json.mkObj [
    ("fingerprint", .str state.fingerprint.value),
    ("residual", .str (match state.residual with
      | .absent => "absent"
      | .marketplace => "marketplace"))
  ]

private def writeBasis (before : Basis) : Json :=
  Json.mkObj [
    ("interrupted", .str before.interrupted.value),
    ("pending", .str before.pending.value),
    ("observed", writeSnapshot before.observed)
  ]

private def writePending (pending : Pending) : Json :=
  tagged "repair_pending" [
    ("plan", .str pending.plan.value),
    ("before", writeBasis pending.before)
  ]

private def writeState : State → Json
  | .operationPending plan => tagged "operation_pending" [("plan", .str plan.value)]
  | .repairPending pending => writePending pending
  | .complete plan => tagged "complete" [("plan", .str plan.value)]

private def writeConflict : Conflict → Json
  | .unknown => .str "unknown"
  | .unowned => .str "unowned"
  | .drift => .str "drift"

private def writeInspection : Inspection → Json
  | .recoverable state => tagged "recoverable" [("state", writeSnapshot state)]
  | .blocked reason => tagged "blocked" [("reason", writeConflict reason)]

private def writeProposal : Proposal → Json
  | .repair before => tagged "repair" [("before", writeBasis before)]
  | .blocked reason => tagged "blocked" [("reason", writeConflict reason)]
  | .notPending => tagged "not_pending"

private def writeChange : Change → Json
  | .none => .str "none"
  | .removeMarketplace => .str "remove_marketplace"

private def writeRejection : PlanRejection → Json
  | .invalidPlan => .str "invalid_plan"
  | .stalePlan => .str "stale_plan"
  | .differentPendingPlan => .str "different_pending_plan"

private def writeBegin : BeginResult → Json
  | .start pending change => tagged "start" [
      ("state", writePending pending),
      ("change", writeChange change)
    ]
  | .resume pending => tagged "resume" [("state", writePending pending)]
  | .completed => tagged "completed"
  | .rejected reason => tagged "rejected" [("reason", writeRejection reason)]

private def writeSettlement : Settlement → Json
  | .completed plan => tagged "completed" [
      ("state", tagged "complete" [("plan", .str plan.value)])
    ]
  | .uncertain state observed => tagged "uncertain" [
      ("state", writePending state),
      ("observed", writeInspection observed)
    ]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "repair_propose" =>
      (fun parsed => writeProposal (model.propose parsed)) <$> readProposalInput input
    | "repair_begin" =>
      (fun parsed => writeBegin (model.begin parsed)) <$> readBeginInput input
    | "repair_settle" =>
      (fun parsed => writeSettlement (model.settle parsed)) <$> readSettleInput input
    | _ => throw s!"unsupported request: {tag}"
  return Json.mkObj [("schema", 1), ("type", .str tag), ("output", output)]

end PluginSdk.Repair.Wire
