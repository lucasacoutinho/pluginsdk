import PluginSdk.Lifecycle.Model
import PluginSdk.WireJson

namespace PluginSdk.Lifecycle.Wire

open Lean (Json)
open WireJson

private def readPlanId (json : Json) : Except String PlanId := PlanId.mk <$> readHex json
private def readBundle (json : Json) : Except String BundleDigest := BundleDigest.mk <$> readHex json

private def readIdentity (json : Json) : Except String Identity := do
  checkFields json ["plan", "bundle"]
  return ⟨← readPlanId (← json.getObjVal? "plan"), ← readBundle (← json.getObjVal? "bundle")⟩

private def readReceipt (json : Json) : Except String Receipt := do
  checkFields json ["identity", "fingerprint"]
  return ⟨← readIdentity (← json.getObjVal? "identity"),
    ⟨← readHex (← json.getObjVal? "fingerprint")⟩⟩

private def readObservation (json : Json) : Except String Observation := do
  match ← (← json.getObjVal? "type").getStr? with
  | "absent" => checkFields json ["type"]; return .absent
  | "unknown" => checkFields json ["type"]; return .unknown
  | "present" =>
    checkFields json ["type", "fingerprint", "identity"]
    return .present ⟨← readHex (← json.getObjVal? "fingerprint")⟩
      (← readOptional readIdentity (← json.getObjVal? "identity"))
  | tag => throw s!"unknown observation: {tag}"

private def readSnapshot (json : Json) : Except String Snapshot := do
  checkFields json ["revision", "receipt", "observed"]
  return ⟨← readOptional readPlanId (← json.getObjVal? "revision"),
    ← readOptional readReceipt (← json.getObjVal? "receipt"),
    ← readObservation (← json.getObjVal? "observed")⟩

private def readDesired (json : Json) : Except String Desired := do
  match ← (← json.getObjVal? "type").getStr? with
  | "absent" => checkFields json ["type"]; return .absent
  | "present" =>
    checkFields json ["type", "bundle"]
    return .present (← readBundle (← json.getObjVal? "bundle"))
  | tag => throw s!"unknown desired state: {tag}"

private def readChange (json : Json) : Except String Change := do
  match ← (← json.getObjVal? "type").getStr? with
  | "install" =>
    checkFields json ["type", "bundle"]
    return .install (← readBundle (← json.getObjVal? "bundle"))
  | "replace" =>
    checkFields json ["type", "bundle"]
    return .replace (← readBundle (← json.getObjVal? "bundle"))
  | "remove" => checkFields json ["type"]; return .remove
  | tag => throw s!"unknown change: {tag}"

private def readIdle (json : Json) : Except String Idle := do
  match ← (← json.getObjVal? "type").getStr? with
  | "empty" =>
    checkFields json ["type", "last"]
    return .empty (← readOptional readPlanId (← json.getObjVal? "last"))
  | "installed" =>
    checkFields json ["type", "receipt"]
    return .installed (← readReceipt (← json.getObjVal? "receipt"))
  | "not_applied" =>
    checkFields json ["type", "plan", "change", "state"]
    return .notApplied (← readPlanId (← json.getObjVal? "plan"))
      (← readChange (← json.getObjVal? "change")) (← readSnapshot (← json.getObjVal? "state"))
  | tag => throw s!"unknown idle journal: {tag}"

private def readPending (json : Json) : Except String Pending := do
  checkFields json ["type", "plan", "previous", "observed", "change"]
  unless (← (← json.getObjVal? "type").getStr?) == "pending" do throw "expected a pending journal"
  return ⟨← readPlanId (← json.getObjVal? "plan"), ← readIdle (← json.getObjVal? "previous"),
    ← readObservation (← json.getObjVal? "observed"), ← readChange (← json.getObjVal? "change")⟩

private def readJournal (json : Json) : Except String Journal := do
  if (← (← json.getObjVal? "type").getStr?) == "pending" then .pending <$> readPending json
  else .idle <$> readIdle json

private def readPlanning (json : Json) : Except String PlanningInput := do
  checkFields json ["journal", "observed", "desired"]
  return ⟨← readJournal (← json.getObjVal? "journal"),
    ← readObservation (← json.getObjVal? "observed"), ← readDesired (← json.getObjVal? "desired")⟩

private def readBegin (json : Json) : Except String BeginInput := do
  checkFields json ["journal", "observed", "plan", "before", "change"]
  return ⟨← readJournal (← json.getObjVal? "journal"),
    ← readObservation (← json.getObjVal? "observed"), ← readPlanId (← json.getObjVal? "plan"),
    ← readSnapshot (← json.getObjVal? "before"), ← readChange (← json.getObjVal? "change")⟩

private def readSettle (json : Json) : Except String SettleInput := do
  checkFields json ["journal", "observed"]
  return ⟨← readPending (← json.getObjVal? "journal"), ← readObservation (← json.getObjVal? "observed")⟩

private def writeIdentity (identity : Identity) : Json :=
  Json.mkObj [("plan", .str identity.plan.value), ("bundle", .str identity.bundle.value)]

private def writeReceipt (receipt : Receipt) : Json :=
  Json.mkObj [("identity", writeIdentity receipt.identity), ("fingerprint", .str receipt.fingerprint.value)]

private def writeObservation : Observation → Json
  | .absent => tagged "absent"
  | .unknown => tagged "unknown"
  | .present fingerprint identity => tagged "present"
    [("fingerprint", .str fingerprint.value), ("identity", writeOptional writeIdentity identity)]

private def writeSnapshot (state : Snapshot) : Json :=
  Json.mkObj [("revision", writeOptional (fun id => .str id.value) state.revision),
    ("receipt", writeOptional writeReceipt state.receipt), ("observed", writeObservation state.observed)]

private def writeChange : Change → Json
  | .install bundle => tagged "install" [("bundle", .str bundle.value)]
  | .replace bundle => tagged "replace" [("bundle", .str bundle.value)]
  | .remove => tagged "remove"

private def writeIdle : Idle → Json
  | .empty last => tagged "empty" [("last", writeOptional (fun id => .str id.value) last)]
  | .installed receipt => tagged "installed" [("receipt", writeReceipt receipt)]
  | .notApplied plan change state => tagged "not_applied"
    [("plan", .str plan.value), ("change", writeChange change), ("state", writeSnapshot state)]

private def writePending (pending : Pending) : Json :=
  tagged "pending" [("plan", .str pending.plan.value), ("previous", writeIdle pending.previous),
    ("observed", writeObservation pending.observed), ("change", writeChange pending.change)]

private def writeCompletion : Completion → Json
  | .installed receipt => tagged "installed" [("receipt", writeReceipt receipt)]
  | .removed => tagged "removed"
  | .notApplied => tagged "not_applied"

private def writeConflict : Conflict → Json
  | .unowned => .str "unowned"
  | .drift => .str "drift"
  | .unknown => .str "unknown"

private def writeDecision : Decision → Json
  | .change change before => tagged "change" [("change", writeChange change), ("before", writeSnapshot before)]
  | .unchanged state => tagged "unchanged" [("state", writeSnapshot state)]
  | .blocked reason state => tagged "blocked" [("reason", writeConflict reason), ("state", writeSnapshot state)]
  | .pending plan => tagged "pending" [("plan", .str plan.value)]

private def writeRejection : PlanRejection → Json
  | .invalidPlan => .str "invalid_plan"
  | .stalePlan => .str "stale_plan"
  | .differentPendingPlan => .str "different_pending_plan"

private def writeBegin : BeginResult → Json
  | .start pending => tagged "start" [("journal", writePending pending)]
  | .resume pending => tagged "resume" [("journal", writePending pending)]
  | .completed result => tagged "completed" [("result", writeCompletion result)]
  | .rejected reason => tagged "rejected" [("reason", writeRejection reason)]

private def writeSettlement : Settlement → Json
  | .completed idle result => tagged "completed" [("journal", writeIdle idle), ("result", writeCompletion result)]
  | .uncertain pending observed => tagged "uncertain"
    [("journal", writePending pending), ("observed", writeObservation observed)]

def evaluate (request : Json) : Except String Json := do
  checkFields request ["schema", "type", "input"]
  let version ← (← request.getObjVal? "schema").getNum?
  unless version.toFloat == (1.0 : Float) do throw "unsupported schema version"
  let tag ← (← request.getObjVal? "type").getStr?
  let input ← request.getObjVal? "input"
  let output ← match tag with
    | "decide" => (fun parsed => writeDecision (model.decide parsed)) <$> readPlanning input
    | "begin" => (fun parsed => writeBegin (model.begin parsed)) <$> readBegin input
    | "settle" => (fun parsed => writeSettlement (model.settle parsed)) <$> readSettle input
    | _ => throw s!"unsupported request: {tag}"
  return Json.mkObj [("schema", 1), ("type", .str tag), ("output", output)]

end PluginSdk.Lifecycle.Wire
