import { Schema } from "effect"

export class ProcessRuntimeFailure extends Schema.TaggedError<ProcessRuntimeFailure, { readonly brand: unique symbol }>()("ProcessRuntimeFailure", {
  detail: Schema.NonEmptyString
}) {}
