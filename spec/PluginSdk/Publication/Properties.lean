import PluginSdk.Publication.Types

namespace PluginSdk.Publication

def W1_new_version_exact (model : Interface) : Prop :=
  ∀ input, model.publish input = .published (input.history ++ [input.desired]) ↔
    ValidHistory input.history ∧ ¬HasKey input

def W2_historical_replay_unchanged (model : Interface) : Prop :=
  ∀ input, model.publish input = .unchanged input.history ↔
    ValidHistory input.history ∧ input.desired ∈ input.history

def W3_blocking_exact (model : Interface) : Prop :=
  ∀ input reason, model.publish input = .blocked reason ↔ RequiredReason input reason

def W4_preserves_history (model : Interface) : Prop :=
  ∀ input history,
    (model.publish input = .published history → history = input.history ++ [input.desired]) ∧
    (model.publish input = .unchanged history → history = input.history)

def W5_completed_publication_is_idempotent (model : Interface) : Prop :=
  ∀ input history, model.publish input = .published history →
    model.publish { input with history := history } = .unchanged history

def W6_successful_history_unique (model : Interface) : Prop :=
  ∀ input history,
    model.publish input = .published history ∨ model.publish input = .unchanged history →
    ValidHistory history

end PluginSdk.Publication
