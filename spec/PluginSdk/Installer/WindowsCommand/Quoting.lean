import Init.Data.String.Lemmas.Basic

namespace PluginSdk.Installer.WindowsCommand.Quoting

structure Interface where
  quote : String → String
  read : String → Option String

def Q2_windows_argument_roundtrip (interface : Interface) : Prop :=
  ∀ text, interface.read (interface.quote text) = some text

def encodeBody (slashes : Nat) : List Char → List Char
  | [] => List.replicate (2 * slashes) '\\'
  | '"' :: rest => List.replicate (2 * slashes + 1) '\\' ++ ('"' :: encodeBody 0 rest)
  | '\\' :: rest => encodeBody (slashes + 1) rest
  | character :: rest =>
      List.replicate slashes '\\' ++ (character :: encodeBody 0 rest)

def readBody (slashes : Nat) : List Char → Option (List Char)
  | [] => none
  | '\\' :: rest => readBody (slashes + 1) rest
  | '"' :: rest =>
      if slashes % 2 = 0 then
        if rest.isEmpty then some (List.replicate (slashes / 2) '\\') else none
      else
        ((List.replicate (slashes / 2) '\\' ++ ['"']) ++ ·) <$> readBody 0 rest
  | character :: rest =>
      ((List.replicate slashes '\\' ++ [character]) ++ ·) <$> readBody 0 rest

def quote (text : String) : String :=
  String.ofList ('"' :: (encodeBody 0 text.toList ++ ['"']))

def read (text : String) : Option String :=
  match text.toList with
  | '"' :: body => String.ofList <$> readBody 0 body
  | _ => none

def model : Interface := ⟨quote, read⟩

private theorem readBody_slashes (pending count : Nat) (rest : List Char) :
    readBody pending (List.replicate count '\\' ++ rest) =
      readBody (pending + count) rest := by
  induction count generalizing pending with
  | zero => simp
  | succ count ih =>
      simp only [List.replicate_succ, List.cons_append, readBody]
      rw [ih]
      congr 1
      omega

private theorem replicate_slash_succ (count : Nat) :
    List.replicate (count + 1) '\\' = List.replicate count '\\' ++ ['\\'] := by
  induction count with
  | zero => rfl
  | succ count ih =>
      simpa [Nat.succ_eq_add_one, List.replicate_succ] using
        congrArg (fun tail : List Char => '\\' :: tail) ih

private theorem readBody_encoded (pending : Nat) (text : List Char) :
    readBody 0 (encodeBody pending text ++ ['"']) =
      some (List.replicate pending '\\' ++ text) := by
  induction text generalizing pending with
  | nil =>
      have even : (2 * pending) % 2 = 0 := by omega
      have half : (2 * pending) / 2 = pending := by omega
      rw [encodeBody, readBody_slashes]
      simp [readBody, even, half]
  | cons character rest ih =>
      by_cases isSlash : character = '\\'
      · subst character
        simp only [encodeBody]
        calc
          readBody 0 (encodeBody (pending + 1) rest ++ ['"']) =
              some (List.replicate (pending + 1) '\\' ++ rest) := ih (pending + 1)
          _ = some (List.replicate pending '\\' ++ '\\' :: rest) := by
              rw [replicate_slash_succ]
              simp [List.append_assoc]
      · by_cases isQuote : character = '"'
        · subst character
          have odd : (2 * pending + 1) % 2 = 1 := by omega
          have half : (2 * pending + 1) / 2 = pending := by omega
          rw [encodeBody, List.append_assoc, readBody_slashes]
          simp [readBody, odd, half, ih 0, List.append_assoc]
        · have notSlash : character ≠ '\\' := isSlash
          have notQuote : character ≠ '"' := isQuote
          rw [encodeBody, List.append_assoc, readBody_slashes]
          simp_all [readBody, List.append_assoc]
          · exact notQuote
          · exact notSlash

namespace Proofs

theorem Q2_windows_argument_roundtrip :
    Quoting.Q2_windows_argument_roundtrip model := by
  intro text
  simp [model, quote, read, readBody_encoded]

end Proofs

end PluginSdk.Installer.WindowsCommand.Quoting
