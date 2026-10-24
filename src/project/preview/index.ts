import { Effect, FileSystem, Match } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"
import type { Intent } from "../../../contracts/Installer.ts"
import { Directory, PluginId } from "../../../contracts/Plugin.ts"
import {
  LocalPreviewStatus, ProjectError, type DirectPreviewClient, type LocalClient,
  type PreviewClient, type PreviewResult, type ProjectDefinition
} from "../../../contracts/Project.ts"
import { commitment } from "../../internal/identity.ts"
import { compileProject, pluginDefinition, recommendedFormat } from "../build.ts"
import { inspectClient, localHome, resolveClient } from "./clients.ts"
import { previewProvider } from "./imports.ts"
import { applyInherited, applyInstallation, prepareInstallation, type PreparedInstallation } from "./installations.ts"
import { routePreview } from "./model.ts"

export const previewProject = Effect.fn("Project.preview")(function*(
  definition: ProjectDefinition,
  source: Directory,
  clients: NonEmptyReadonlyArray<LocalClient>,
  remove: boolean
) {
  const fs = yield* FileSystem.FileSystem
  const root = yield* fs.realPath(source).pipe(Effect.mapError(() => new ProjectError({ detail: "Cannot resolve the plugin source directory" })))
  const plugin = PluginId.make(`psdk-dev-${definition.id.slice(0, 30)}-${commitment("preview", { root, plugin: definition.id }).slice(0, 16)}`)
  const development: ProjectDefinition = { ...definition, id: plugin }
  const detected = yield* Effect.forEach(clients, (client) => inspectClient(client, remove ? null : recommendedFormat(pluginDefinition(development), client)))
  const available = detected.flatMap(({ client, profile }) => profile === null ? [] : [{ client, profile }])
  const [first, ...rest] = available
  if (first === undefined) return yield* new ProjectError({ detail: "No local clients found; install a supported client and see docs/compatibility.md" })
  const bundles = remove ? [] : yield* compileProject(development, Directory.make(root), [first.client, ...rest.map(({ client }) => client)])
  const resolved = yield* Effect.forEach(available, ({ client, profile }) => resolveClient(client, profile))
  const provider = remove ? "none" : yield* previewProvider(development, resolved)
  const routes = yield* Effect.forEach(resolved, (client) => Match.value(routePreview({
    client: client.client, desired: remove ? "absent" : "present", provider
  })).pipe(Match.discriminatorsExhaustive("type")({
    direct: (route) => Effect.succeed({ client, route }),
    inherited: (route) => Effect.succeed({ client, route }),
    blocked: () => Effect.fail(new ProjectError({ detail: "Cursor's Claude import is qualified only for skills on the pinned profiles; use an explicit --target for other plugin features" }))
  })))

  const plans = yield* Effect.forEach(routes, ({ client, route }) => Effect.gen(function*() {
    const intent = yield* Match.value(route).pipe(Match.discriminatorsExhaustive("type")({
      inherited: () => Effect.succeed<Intent>({ type: "absent", plugin }),
      direct: ({ desired }) => Match.value(desired).pipe(
        Match.when("absent", () => Effect.succeed<Intent>({ type: "absent", plugin })),
        Match.when("present", () => Effect.gen(function*() {
          const bundle = bundles.find((bundle) => recommendedFormat(pluginDefinition(development), client.client) === bundle.format)
          if (bundle === undefined) return yield* new ProjectError({ detail: `Preview package is missing for ${client.client}` })
          return { type: "present", bundle } satisfies Intent
        })),
        Match.exhaustive
      )
    }))
    return { route, installation: yield* prepareInstallation(client.client, client.home, intent) }
  }))

  const direct: Array<{ readonly installation: PreparedInstallation; readonly status: LocalPreviewStatus }> = []
  for (const { route, installation } of plans) yield* Match.value(route).pipe(Match.discriminatorsExhaustive("type")({
    direct: () => applyInstallation(installation).pipe(Effect.map((status) => { direct.push({ installation, status }) })),
    inherited: () => Effect.void
  }))

  const results: PreviewClient[] = [
    ...detected.filter(({ profile }) => profile === null).map(({ client }): DirectPreviewClient => ({ client, home: localHome(client), status: "missing" })),
    ...direct.map(({ installation, status }): DirectPreviewClient => ({ client: installation.client, home: installation.home, status }))
  ]
  for (const { route, installation } of plans) yield* Match.value(route).pipe(Match.discriminatorsExhaustive("type")({
    direct: () => Effect.void,
    inherited: (route) => Effect.gen(function*() {
      const provider = direct.find(({ installation }) => installation.client === "claude_code")
      if (provider === undefined) return yield* Effect.die(new Error("Inherited preview route has no selected provider outcome"))
      const status = yield* applyInherited(provider.installation.request, provider.status, installation,
        previewProvider(development, resolved).pipe(Effect.map((provider) => provider === "qualified")))
      results.push(Match.value(status).pipe(Match.withReturnType<PreviewClient>(),
        Match.when("inherited", () => ({
          client: route.client, home: installation.home, status: "inherited",
          provider: { client: route.provider, home: provider.installation.home }
        })),
        Match.whenOr(...LocalPreviewStatus.literals, (status) => ({ client: route.client, home: installation.home, status })),
        Match.exhaustive
      ))
    })
  }))
  return { plugin, clients: results } satisfies PreviewResult
})
