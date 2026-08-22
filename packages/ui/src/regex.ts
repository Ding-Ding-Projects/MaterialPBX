export interface SearchPattern {
  query: string
  regex: boolean
  flags: string
}

export function compileSearch(pattern: SearchPattern): { matcher: (value: string) => boolean; error?: string } {
  if (!pattern.regex) {
    const query = pattern.query.toLocaleLowerCase()
    return { matcher: (value) => value.toLocaleLowerCase().includes(query) }
  }
  if (pattern.query.length > 512) return { matcher: () => false, error: 'Pattern is limited to 512 characters.' }
  try {
    const expression = new RegExp(pattern.query, pattern.flags.replace(/[^gimsuy]/g, ''))
    return { matcher: (value) => { expression.lastIndex = 0; return expression.test(value) } }
  } catch (error) {
    return { matcher: () => false, error: error instanceof Error ? error.message : 'Invalid regular expression.' }
  }
}

