import { PackagePath } from "../../contracts/Plugin.ts"

const utf8Encoder = new TextEncoder()

export const compareUtf8 = (left: string, right: string): number => {
  const leftBytes = utf8Encoder.encode(left)[Symbol.iterator]()
  const rightBytes = utf8Encoder.encode(right)[Symbol.iterator]()
  while (true) {
    const leftByte = leftBytes.next()
    const rightByte = rightBytes.next()
    if (leftByte.done) return rightByte.done ? 0 : -1
    if (rightByte.done) return 1
    if (leftByte.value < rightByte.value) return -1
    if (leftByte.value > rightByte.value) return 1
  }
}

export const asciiFold = (value: string): string =>
  value.replace(/[A-Z]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) + 32))

const collisionPath = (left: PackagePath, right: PackagePath): PackagePath | null => {
  const leftKey = asciiFold(left)
  const rightKey = asciiFold(right)
  if (leftKey === rightKey || rightKey.startsWith(`${leftKey}/`)) return PackagePath.make(leftKey)
  if (leftKey.startsWith(`${rightKey}/`)) return PackagePath.make(rightKey)
  return null
}

export const pathCollisionKeys = (paths: ReadonlyArray<PackagePath>): PackagePath[] => {
  const keys: PackagePath[] = []
  for (const [index, left] of paths.entries()) {
    for (const right of paths.slice(index + 1)) {
      const path = collisionPath(left, right)
      if (path !== null) keys.push(path)
    }
  }
  return keys
}
