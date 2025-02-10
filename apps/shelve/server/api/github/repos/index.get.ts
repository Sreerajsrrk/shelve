import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const { user, secure } = await requireUserSession(event)
  const { q } = await getValidatedQuery(event, z.object({
    q: z.string().optional(),
  }).parse)
  return await new GithubService(event).getUserRepos(user.id, secure.githubToken, q)
})
