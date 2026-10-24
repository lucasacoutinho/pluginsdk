import { chmod, lstat, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { InstallationKey } from "../../contracts/Installer.ts"
import { stageFile } from "../../src/installer/storage.ts"

const allowedMasks = new Set(["0022", "0077", "0111", "0177", "0777"])
const probeKey = InstallationKey.make("stage-file-umask-probe")
const bytes = Uint8Array.from([0, 65, 255, 10, 128, 13, 0])
const replacementBytes = Uint8Array.from([90, 0, 90])
const octal = (value) => value.toString(8).padStart(3, "0")
const errorDetails = (error) => ({
	tag: typeof error?._tag === "string" ? error._tag : null,
	name: typeof error?.name === "string" ? error.name : null,
	causeName: typeof error?.cause?.name === "string" ? error.cause.name : null,
	causeCode: typeof error?.cause?.code === "string" ? error.cause.code : null
})
const readForObservation = async (path, mode) => {
	const addedOwnerReadForObservation = process.platform !== "win32" && (mode & 0o400) === 0
	if (addedOwnerReadForObservation) await chmod(path, mode | 0o400)
	try {
		return { bytes: await readFile(path), addedOwnerReadForObservation }
	} finally {
		if (addedOwnerReadForObservation) await chmod(path, mode)
	}
}
const removeParent = async (allocated, physicalParent) => {
	await rm(allocated, { recursive: true, force: true })
	try {
		await lstat(physicalParent ?? allocated)
		return false
	} catch (error) {
		if (error?.code !== "ENOENT") throw error
		return true
	}
}

const maskText = process.argv[2]
if (!allowedMasks.has(maskText)) {
	process.stderr.write("Expected one of the supported octal umasks\n")
	process.exitCode = 2
} else {
	const mask = Number.parseInt(maskText, 8)
	const allocated = await mkdtemp(join(tmpdir(), "pluginsdk-stage-umask-"))
	let physicalParent
	let priorUmask
	let report = {
		schema: 1,
		node: process.version,
		platform: process.platform,
		mask,
		maskOctal: maskText,
		parent: null,
		files: [],
		collision: null,
		cleanup: null,
		fatal: null
	}

	try {
		physicalParent = await realpath(allocated)
		await chmod(physicalParent, 0o700)
		const physicalBeforeUmask = await realpath(physicalParent)
		if (physicalBeforeUmask !== physicalParent) throw new Error("Temporary staging parent is not physical")
		const parentModeBeforeUmask = (await stat(physicalParent)).mode & 0o777
		priorUmask = process.umask(mask)
		report.parent = {
			createdBeforeUmask: true,
			physicalPathConfirmed: true,
			modeBeforeUmask: parentModeBeforeUmask,
			modeBeforeUmaskOctal: octal(parentModeBeforeUmask)
		}

		for (const requestedExecutable of [true, false]) {
			const name = requestedExecutable ? "executable.bin" : "plain.bin"
			const path = join(physicalParent, name)
			await Effect.runPromise(stageFile(probeKey, path, bytes, requestedExecutable))
			const observedMode = (await stat(path)).mode & 0o777
			const observation = await readForObservation(path, observedMode)
			report.files.push({
				name,
				requestedExecutable,
				requestedMode: requestedExecutable ? 0o755 : 0o644,
				requestedModeOctal: requestedExecutable ? "755" : "644",
				observedMode,
				observedModeOctal: octal(observedMode),
				observedExecuteBits: observedMode & 0o111,
				observedBytesBase64: observation.bytes.toString("base64"),
				observedBytesHex: observation.bytes.toString("hex"),
				observedByteLength: observation.bytes.byteLength,
				observerTemporarilyAddedOwnerRead: observation.addedOwnerReadForObservation
			})
		}

		const executablePath = join(physicalParent, "executable.bin")
		const beforeCollisionMode = (await stat(executablePath)).mode & 0o777
		const beforeCollision = await readForObservation(executablePath, beforeCollisionMode)
		let collisionError = null
		try {
			await Effect.runPromise(stageFile(probeKey, executablePath, replacementBytes, false))
		} catch (error) {
			collisionError = errorDetails(error)
		}
		const afterCollisionMode = (await stat(executablePath)).mode & 0o777
		const afterCollision = await readForObservation(executablePath, afterCollisionMode)
		report.collision = {
			attempted: true,
			error: collisionError,
			bytesBeforeBase64: beforeCollision.bytes.toString("base64"),
			bytesAfterBase64: afterCollision.bytes.toString("base64"),
			modeBefore: beforeCollisionMode,
			modeAfter: afterCollisionMode,
			observerTemporarilyAddedOwnerRead: beforeCollision.addedOwnerReadForObservation || afterCollision.addedOwnerReadForObservation,
			preserved: beforeCollision.bytes.equals(afterCollision.bytes) && beforeCollisionMode === afterCollisionMode
		}
	} catch (error) {
		report.fatal = errorDetails(error)
		report.fatalMessage = error instanceof Error ? error.message : String(error)
	} finally {
		if (priorUmask !== undefined) process.umask(priorUmask)
		try {
			const physicalParentAbsent = await removeParent(allocated, physicalParent)
			report.cleanup = { attempted: true, physicalParentAbsent }
		} catch (error) {
			report.cleanup = { attempted: true, error: errorDetails(error) }
		}
	}

	process.stdout.write(JSON.stringify(report) + "\n")
	if (report.fatal !== null || report.cleanup?.error !== undefined || report.cleanup?.physicalParentAbsent !== true) {
		process.exitCode = 1
	}
}
