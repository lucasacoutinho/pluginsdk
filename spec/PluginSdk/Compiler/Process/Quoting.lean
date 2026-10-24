import Init.Data.String.Lemmas.Basic

namespace PluginSdk.Compiler.Process.Quoting

structure Interface where
  quote : String → String
  read : String → Option String

def Q1_literal_word_roundtrip (model : Interface) : Prop :=
  ∀ value, model.read (model.quote value) = some value

def encodeBody : List Char → List Char
  | [] => []
  | c :: rest =>
      if c = '\'' then '\'' :: '\\' :: '\'' :: '\'' :: encodeBody rest
      else c :: encodeBody rest

def readBody : List Char → Option (List Char)
  | [] => none
  | c :: rest =>
      if c = '\'' then
        match rest with
        | [] => some []
        | '\\' :: '\'' :: '\'' :: tail => ('\'' :: ·) <$> readBody tail
        | _ => none
      else (c :: ·) <$> readBody rest

def quote (value : String) : String :=
  String.ofList ('\'' :: (encodeBody value.toList ++ ['\'']))

def read (value : String) : Option String :=
  match value.toList with
  | '\'' :: body => String.ofList <$> readBody body
  | _ => none

def model : Interface := ⟨quote, read⟩

private theorem read_encoded_body (value : List Char) :
    readBody (encodeBody value ++ ['\'']) = some value := by
  induction value with
  | nil => rfl
  | cons c rest ih =>
    by_cases apostrophe : c = '\''
    · subst c
      simp [encodeBody, readBody, ih]
    · simp only [encodeBody, apostrophe, ite_false, List.cons_append]
      rw [readBody.eq_def]
      simp [apostrophe, ih]

namespace Proofs

theorem Q1_literal_word_roundtrip : Quoting.Q1_literal_word_roundtrip model := by
  intro value
  simp [model, quote, read, read_encoded_body]

end Proofs

end PluginSdk.Compiler.Process.Quoting
