import PluginSdk.Compiler.Format

namespace PluginSdk.Compiler

instance (value : String) : Decidable (HasExpansion value) :=
  inferInstanceAs (Decidable (List.IsInfix _ _))

theorem hasExpansion_iff (text : String) : HasExpansion text ↔ ∃ before after, text = before ++ "${" ++ after := by
  have marker : ("${" : String).toList = ['$', '{'] := by decide
  constructor
  · rintro ⟨before, after, equal⟩
    refine ⟨String.ofList before, String.ofList after, ?_⟩
    apply String.toList_inj.mp
    simp only [String.toList_append, String.toList_ofList, marker]
    exact equal.symm
  · rintro ⟨before, after, rfl⟩
    exact ⟨before.toList, after.toList, by simp only [String.toList_append, marker]⟩

def valueProblems (format : Format) (header : String) : HeaderValue → List McpProblem
  | .literal text =>
    if format = .claudeCode ∧ HasExpansion text then [.literalExpansion (asciiFold header)] else []
  | .environment _ literalPrefix =>
    (if format ≠ .claudeCode then [.environmentReference (asciiFold header)] else []) ++
    (if format = .claudeCode ∧ HasExpansion literalPrefix then [.literalExpansion (asciiFold header)] else [])

def headerProblems (format : Format) (source : RemoteMcp) : List McpProblem :=
  source.headers.flatMap (fun (name, value) => valueProblems format name value) ++
  source.headers.flatMap fun (left, _) => source.headers.flatMap fun (right, _) =>
    if left ≠ right ∧ asciiFold left = asciiFold right then [.headerCollision (asciiFold left)] else []

def mcpIssues (input : RenderInput) : List RenderIssue :=
  input.mcp.flatMap fun (name, source) =>
    (headerProblems input.format source).map (.unsupportedMcp name)

theorem valueProblems_meaning (format : Format) (header : String) (value : HeaderValue)
    (absent : valueProblems format header value = []) : HeaderMeaning format value
      (match value with
        | .literal text => text
        | .environment name literalPrefix => literalPrefix ++ "${" ++ name ++ "}") := by
  cases format <;> cases value <;> simp [valueProblems] at absent <;> simp_all [HeaderMeaning]

theorem mem_valueProblems_environment (format : Format) (name header : String) (value : HeaderValue) :
    .environmentReference header ∈ valueProblems format name value ↔
      format ≠ .claudeCode ∧ ∃ environmentName literalPrefix,
        value = .environment environmentName literalPrefix ∧ header = asciiFold name := by
  cases format <;> cases value <;> simp [valueProblems, and_comm]
  all_goals split <;> simp_all

theorem mem_valueProblems_expansion (format : Format) (name header : String) (value : HeaderValue) :
    .literalExpansion header ∈ valueProblems format name value ↔
      format = .claudeCode ∧ header = asciiFold name ∧
        (match value with | .literal text => HasExpansion text | .environment _ text => HasExpansion text) := by
  cases format <;> cases value <;> simp [valueProblems, and_comm]
  all_goals split <;> simp_all

theorem not_mem_valueProblems_collision (format : Format) (name header : String) (value : HeaderValue) :
    .headerCollision header ∉ valueProblems format name value := by
  cases format <;> cases value <;> simp [valueProblems]
  all_goals split <;> simp_all

theorem mem_mcpIssues (input : RenderInput) (server : String) (reason : McpProblem) :
    .unsupportedMcp server reason ∈ mcpIssues input ↔ UnsupportedRequest input server reason := by
  simp only [mcpIssues, List.mem_flatMap, List.mem_map]
  constructor
  · rintro ⟨⟨name, source⟩, sourceMember, problem, member, equal⟩
    cases equal
    refine ⟨source, sourceMember, ?_⟩
    cases reason with
    | environmentReference header =>
      simp only [headerProblems, List.mem_append, List.mem_flatMap,
        mem_valueProblems_environment] at member
      rcases member with ⟨⟨headerName, value⟩, member, format, environmentName, literalPrefix, rfl, equal⟩ | collision
      · exact ⟨format, headerName, environmentName, literalPrefix, member, equal⟩
      · simp at collision
    | literalExpansion header =>
      simp only [headerProblems, List.mem_append, List.mem_flatMap,
        mem_valueProblems_expansion] at member
      rcases member with ⟨⟨headerName, value⟩, member, format, equal, expansion⟩ | collision
      · exact ⟨format, headerName, value, member, equal, expansion⟩
      · simp at collision
    | headerCollision header =>
      simp only [headerProblems, List.mem_append, List.mem_flatMap,
        not_mem_valueProblems_collision, and_false, exists_false, false_or] at member
      obtain ⟨⟨left, first⟩, leftMember, ⟨right, second⟩, rightMember, collision⟩ := member
      split at collision
      · rename_i aliases
        have headerEqual : header = asciiFold left := by
          simpa only [List.mem_singleton, McpProblem.headerCollision.injEq] using collision
        exact ⟨left, right, first, second, leftMember, rightMember, aliases.1, aliases.2, headerEqual⟩
      · exact False.elim (List.not_mem_nil collision)
  · rintro ⟨source, sourceMember, unsupported⟩
    refine ⟨(server, source), sourceMember, reason, ?_, rfl⟩
    cases reason with
    | environmentReference header =>
      obtain ⟨format, headerName, environmentName, literalPrefix, member, equal⟩ := unsupported
      apply List.mem_append_left
      apply List.mem_flatMap.mpr
      exact ⟨(headerName, .environment environmentName literalPrefix), member,
        (mem_valueProblems_environment ..).mpr ⟨format, environmentName, literalPrefix, rfl, equal⟩⟩
    | literalExpansion header =>
      obtain ⟨format, headerName, value, member, equal, expansion⟩ := unsupported
      apply List.mem_append_left
      apply List.mem_flatMap.mpr
      exact ⟨(headerName, value), member, (mem_valueProblems_expansion ..).mpr ⟨format, equal, expansion⟩⟩
    | headerCollision header =>
      obtain ⟨left, right, first, second, leftMember, rightMember, different, equal, headerEqual⟩ := unsupported
      apply List.mem_append_right
      apply List.mem_flatMap.mpr
      refine ⟨(left, first), leftMember, List.mem_flatMap.mpr ⟨(right, second), rightMember, ?_⟩⟩
      simp [different, equal, headerEqual]

end PluginSdk.Compiler
