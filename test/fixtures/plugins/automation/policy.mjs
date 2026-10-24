let input = ""
for await (const chunk of process.stdin) input += chunk
const event = JSON.parse(input)

if (event.hook_event_name === "SessionStart") {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: "Use the team's review skill and its packaged checklist when reviewing changes."
    }
  }))
}

if (event.hook_event_name === "UserPromptSubmit" && event.prompt.includes("[team:block]")) {
  console.log(JSON.stringify({ decision: "block", reason: "The prompt contains the team's block marker." }))
}
