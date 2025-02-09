import { H3Event } from 'h3'
import { z } from 'zod'

export default defineEventHandler(async (event: H3Event) => {
  const { user } = await requireUserSession(event)
  return await new GithubService(event).deleteApp(user.id)
})
