import { Array as EffectArray, Match, Order, Schema } from "effect"
import { PlanningIssue } from "../../contracts/DistributionModel.ts"
import type {
  Candidate,
  Normalization,
  NormalizationInput,
  PlanningIssue as PlanningIssueValue,
  StepDescriptor
} from "../../contracts/DistributionModel.ts"
import { compareUtf8 } from "../internal/paths.ts"

type NonEmpty<A> = [A, ...A[]]

const sameIssue = Schema.toEquivalence(PlanningIssue)

const candidateTarget = (candidate: Candidate) => Match.value(candidate).pipe(
  Match.discriminatorsExhaustive("type")({
    ready: ({ step }) => step.target,
    blocked: ({ target }) => target
  })
)

const issueKey = (issue: PlanningIssueValue): ReadonlyArray<string> =>
  Match.value(issue).pipe(Match.discriminatorsExhaustive("type")({
    blocked: ({ target, reason }) => ["blocked", target, reason],
    duplicate_installation: ({ installation }) => ["duplicate_installation", installation],
    duplicate_target: ({ target }) => ["duplicate_target", target]
  }))

const issueOrder = Order.mapInput(Order.Array(Order.make(compareUtf8)), issueKey)

const candidateIssues = (candidates: NormalizationInput["candidates"]): PlanningIssueValue[] => {
  const issues: PlanningIssueValue[] = []
  const targetCounts = new Map<ReturnType<typeof candidateTarget>, number>()
  const installationCounts = new Map<StepDescriptor["installation"], number>()

  for (const candidate of candidates) {
    const target = candidateTarget(candidate)
    targetCounts.set(target, (targetCounts.get(target) ?? 0) + 1)

    Match.value(candidate).pipe(Match.discriminatorsExhaustive("type")({
      ready: ({ step }) => {
        installationCounts.set(step.installation, (installationCounts.get(step.installation) ?? 0) + 1)
      },
      blocked: ({ target: blockedTarget, reason }) => {
        issues.push({ type: "blocked", target: blockedTarget, reason })
      }
    }))
  }

  for (const [target, count] of targetCounts) {
    if (count > 1) issues.push({ type: "duplicate_target", target })
  }

  for (const [installation, count] of installationCounts) {
    if (count > 1) issues.push({ type: "duplicate_installation", installation })
  }

  return issues
}

const canonicalIssues = (
  issues: NonEmpty<PlanningIssueValue>
): NonEmpty<PlanningIssueValue> => EffectArray.dedupeWith(issues, sameIssue).sort(issueOrder)

const readySteps = (candidates: ReadonlyArray<Candidate>): StepDescriptor[] =>
  candidates.flatMap((candidate) => Match.value(candidate).pipe(
    Match.discriminatorsExhaustive("type")({
      ready: ({ step }) => [step],
      blocked: () => []
    })
  ))

export const normalizeDistribution = (input: NormalizationInput): Normalization => {
  const [firstCandidate, ...remainingCandidates] = input.candidates
  const issues = candidateIssues(input.candidates)

  return Match.value(firstCandidate).pipe(Match.discriminatorsExhaustive("type")({
    ready: ({ step }): Normalization => {
      const [firstIssue] = issues
      if (firstIssue !== undefined) {
        return { type: "blocked", issues: canonicalIssues([firstIssue, ...issues.slice(1)]) }
      }

      const steps: NonEmpty<StepDescriptor> = [step, ...readySteps(remainingCandidates)]
      steps.sort((left, right) => compareUtf8(left.target, right.target))
      return { type: "ready", steps }
    },
    blocked: ({ target, reason }): Normalization => {
      const witness: PlanningIssueValue = { type: "blocked", target, reason }
      return { type: "blocked", issues: canonicalIssues([witness, ...issues]) }
    }
  }))
}
