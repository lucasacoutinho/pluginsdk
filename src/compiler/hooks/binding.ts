import { Match } from "effect"
import {
  claudeRootArgument,
  claudeRuntimeArgument,
  type Input,
  type Output
} from "../../../contracts/HookBinding.ts"
import { LauncherPath } from "../../../contracts/Launcher.ts"
import { ProcessText } from "../../../contracts/Plugin.ts"

const codexBootstrap =
  "node --input-type=commonjs -e \"const p=require('node:path'),u=require('node:url'),r=process.env.PLUGIN_ROOT,e=p.join(r,'.psdk/runtime/process.mjs');process.argv.splice(1,0,e,r);import(u.pathToFileURL(e).href)\" -- "

export function bindHook(input: Input): Output {
  const path = LauncherPath.make(`.psdk/hooks/${input.ordinal}.json`)
  return Match.value(input.host).pipe(
    Match.when("claude_code", (): Output => ({
      type: "direct",
      path,
      command: "node",
      args: [claudeRuntimeArgument, claudeRootArgument, path]
    })),
    Match.when("codex", (): Output => ({
      type: "shell",
      path,
      command: ProcessText.make(codexBootstrap + path)
    })),
    Match.exhaustive
  )
}
