type AgentClient = {
  app: {
    agents(): Promise<{ data?: Array<{ name: string }> }>
  }
}

type SessionClient = {
  session: {
    diff(args: {
      path: { id: string }
      query?: { directory?: string }
    }): Promise<{ data?: Array<{ file: string; additions: number; deletions: number }> }>
    todo(args: {
      path: { id: string }
      query?: { directory?: string }
    }): Promise<{ data?: Array<{ id: string; status: string }> }>
  }
}

export async function loadAvailableAgents(client: AgentClient): Promise<Set<string>> {
  const response = await client.app.agents()
  const agents = response.data ?? []
  return new Set(agents.map((agent) => agent.name))
}

export async function readSessionDiffSummary(
  client: SessionClient,
  sessionID: string,
  directory: string
): Promise<{
  files: number
  additions: number
  deletions: number
}> {
  const response = await client.session.diff({
    path: { id: sessionID },
    query: { directory },
  })

  const diffs = response.data ?? []
  const additions = diffs.reduce((total, diff) => total + diff.additions, 0)
  const deletions = diffs.reduce((total, diff) => total + diff.deletions, 0)
  return {
    files: diffs.length,
    additions,
    deletions,
  }
}

export async function readTodoPressure(
  client: SessionClient,
  sessionID: string,
  directory: string
): Promise<{
  pending: number
  inProgress: number
  total: number
}> {
  const response = await client.session.todo({
    path: { id: sessionID },
    query: { directory },
  })

  const todos = response.data ?? []
  let pending = 0
  let inProgress = 0
  for (const todo of todos) {
    if (todo.status === "pending") pending++
    if (todo.status === "in_progress") inProgress++
  }

  return {
    pending,
    inProgress,
    total: todos.length,
  }
}
