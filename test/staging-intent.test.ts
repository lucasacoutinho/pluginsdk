import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { PermissionBits } from "../contracts/ExecutableIntent.ts"
import { parseJson } from "../src/internal/json.ts"

const masks = ["0022", "0077", "0111", "0177", "0777"] as const
const fixture = fileURLToPath(new URL("./fixtures/stage-file-umask.mjs", import.meta.url))
const expectedBytes = Buffer.from([0, 65, 255, 10, 128, 13, 0])

const ErrorDetails = Schema.Struct({
	tag: Schema.NullOr(Schema.String),
	name: Schema.NullOr(Schema.String),
	causeName: Schema.NullOr(Schema.String),
	causeCode: Schema.NullOr(Schema.String)
})
const StagedFile = Schema.Struct({
	name: Schema.Literals(["executable.bin", "plain.bin"]),
	requestedExecutable: Schema.Boolean,
	requestedMode: PermissionBits,
	requestedModeOctal: Schema.String,
	observedMode: PermissionBits,
	observedModeOctal: Schema.String,
	observedExecuteBits: PermissionBits,
	observedBytesBase64: Schema.String,
	observedBytesHex: Schema.String,
	observedByteLength: Schema.Natural,
	observerTemporarilyAddedOwnerRead: Schema.Boolean
})
const ChildReportSchema = Schema.Struct({
	schema: Schema.Literal(1),
	node: Schema.NonEmptyString,
	platform: Schema.NonEmptyString,
	mask: Schema.Natural,
	maskOctal: Schema.Literals(masks),
	parent: Schema.NullOr(Schema.Struct({
		createdBeforeUmask: Schema.Boolean,
		physicalPathConfirmed: Schema.Boolean,
		modeBeforeUmask: PermissionBits,
		modeBeforeUmaskOctal: Schema.String
	})),
	files: Schema.Array(StagedFile),
	collision: Schema.NullOr(Schema.Struct({
		attempted: Schema.Boolean,
		error: Schema.NullOr(ErrorDetails),
		bytesBeforeBase64: Schema.String,
		bytesAfterBase64: Schema.String,
		modeBefore: PermissionBits,
		modeAfter: PermissionBits,
		observerTemporarilyAddedOwnerRead: Schema.Boolean,
		preserved: Schema.Boolean
	})),
	cleanup: Schema.NullOr(Schema.Struct({
		attempted: Schema.Boolean,
		physicalParentAbsent: Schema.optionalKey(Schema.Boolean),
		error: Schema.optionalKey(ErrorDetails)
	})),
	fatal: Schema.NullOr(ErrorDetails),
	fatalMessage: Schema.optionalKey(Schema.String)
})
type ChildReport = typeof ChildReportSchema.Type
const decodeChildReport = Schema.decodeUnknownSync(ChildReportSchema, { onExcessProperty: "error" })

const expectedModes = {
	"0022": { executable: 0o755, plain: 0o644 },
	"0077": { executable: 0o700, plain: 0o600 },
	"0111": { executable: 0o744, plain: 0o644 },
	"0177": { executable: 0o700, plain: 0o600 },
	"0777": { executable: 0o100, plain: 0o000 }
} satisfies Record<typeof masks[number], { readonly executable: number; readonly plain: number }>

const runChild = (mask: typeof masks[number]): ChildReport => {
	const child = spawnSync(process.execPath, ["--experimental-strip-types", fixture, mask], {
		encoding: "utf8",
		timeout: 30_000,
		maxBuffer: 1024 * 1024
	})
	if (child.error !== undefined) throw child.error
	expect(child.status, child.stderr).toBe(0)
	if (child.stdout.trim() === "") throw new Error("Staging child returned no JSON report")
	return decodeChildReport(parseJson(child.stdout))
}

for (const maskText of masks) {
	it(`preserves executable intent and umask read/write restrictions under ${maskText}`, () => {
		const report = runChild(maskText)
		const mask = Number.parseInt(maskText, 8)
		expect(report.schema).toBe(1)
		expect(report.maskOctal).toBe(maskText)
		expect(report.mask).toBe(mask)
		expect(report.parent?.createdBeforeUmask).toBe(true)
		expect(report.parent?.physicalPathConfirmed).toBe(true)
		expect(report.fatal).toBeNull()
		expect(report.files.map(({ requestedExecutable }) => requestedExecutable)).toEqual([true, false])

		for (const file of report.files) {
			expect(file.observedBytesBase64).toBe(expectedBytes.toString("base64"))
			expect(file.observedBytesHex).toBe(expectedBytes.toString("hex"))
			expect(file.observedByteLength).toBe(expectedBytes.byteLength)

			if (report.platform !== "win32") {
				const expectedMode = file.requestedExecutable
					? expectedModes[maskText].executable
					: expectedModes[maskText].plain
				const requestedMode = file.requestedExecutable ? 0o755 : 0o644
				const maskedReadWriteBits = (requestedMode & ~mask) & 0o666
				expect(file.observedMode).toBe(expectedMode)
				expect(file.requestedMode).toBe(requestedMode)
				expect(file.observedMode & 0o666).toBe(maskedReadWriteBits)
				expect(file.observedMode & 0o222).toBe(maskedReadWriteBits & 0o222)
				expect((file.observedMode & 0o111) !== 0).toBe(file.requestedExecutable)
			}
		}

		expect(report.collision?.attempted).toBe(true)
		expect(report.collision?.error?.tag).toBe("StateUnavailable")
		expect(report.collision?.error?.causeCode).toBe("EEXIST")
		expect(report.collision?.preserved).toBe(true)
		expect(report.collision?.bytesAfterBase64).toBe(expectedBytes.toString("base64"))
		expect(report.cleanup?.attempted).toBe(true)
		expect(report.cleanup?.physicalParentAbsent).toBe(true)
	})
}
