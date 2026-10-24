import { Match } from "effect"
import type { DomainStatus, StatusInput } from "../../../contracts/Execution.ts"

export function executionDomainStatus({ domain, observed }: StatusInput): DomainStatus {
  return Match.value(domain).pipe(Match.discriminatorsExhaustive("type")({
    process_group: (domain) => Match.value(observed).pipe(Match.discriminatorsExhaustive("type")({
      unknown: (): DomainStatus => "unknown",
      boot: (observed): DomainStatus => observed.boot === domain.boot ? "unknown" : "quiescent",
      windows_job: (): DomainStatus => "unknown",
      process_group: (observed): DomainStatus => {
        if (observed.group !== domain.group || observed.boot !== domain.boot) return "unknown"
        return Match.value(observed.state).pipe(
          Match.when("present", (): DomainStatus => "active"),
          Match.when("absent", (): DomainStatus => "quiescent"),
          Match.exhaustive
        )
      }
    })),
    windows_job: (domain) => Match.value(observed).pipe(Match.discriminatorsExhaustive("type")({
      unknown: (): DomainStatus => "unknown",
      boot: (): DomainStatus => "unknown",
      process_group: (): DomainStatus => "unknown",
      windows_job: (observed): DomainStatus => {
        if (observed.name !== domain.name) return "unknown"
        return Match.value(observed.state).pipe(
          Match.when("active", (): DomainStatus => "active"),
          Match.when("empty", (): DomainStatus => "unknown"),
          Match.when("absent", (): DomainStatus => "unknown"),
          Match.exhaustive
        )
      }
    }))
  }))
}
