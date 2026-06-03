export type DiffLineKind = 'same' | 'changed'

export interface ProposedLine {
  kind: DiffLineKind
  text: string
}

/** 按行对比，用于预览：展示 proposed 全文，改动行标黄 */
export function diffLinesForPreview(
  original: string,
  proposed: string,
): ProposedLine[] {
  const a = original.split('\n')
  const b = proposed.split('\n')
  const ops = lcsOps(a, b)
  const out: ProposedLine[] = []

  for (const op of ops) {
    if (op.type === 'equal') {
      for (const line of op.lines) {
        out.push({ kind: 'same', text: line })
      }
    } else if (op.type === 'insert') {
      for (const line of op.lines) {
        out.push({ kind: 'changed', text: line })
      }
    }
    /* delete: 仅影响原文，proposed 预览不展示已删行 */
  }

  return out
}

type Op =
  | { type: 'equal'; lines: string[] }
  | { type: 'insert'; lines: string[] }
  | { type: 'delete'; lines: string[] }

function lcsOps(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0),
  )

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const ops: Op[] = []
  let i = n
  let j = m

  const push = (type: Op['type'], line: string) => {
    const last = ops[0]
    if (last && last.type === type) {
      last.lines.unshift(line)
    } else {
      ops.unshift({ type, lines: [line] } as Op)
    }
  }

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      push('equal', a[i - 1])
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      push('insert', b[j - 1])
      j--
    } else if (i > 0) {
      push('delete', a[i - 1])
      i--
    }
  }

  return ops
}

export function hasTextDiff(original: string, proposed: string): boolean {
  return original !== proposed
}
