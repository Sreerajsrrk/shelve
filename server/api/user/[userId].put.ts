import { updateUser } from "~/server/app/userService";
import { H3Event } from "h3";

export default eventHandler(async (event: H3Event) => {
  const params = event.context.params;
  if (!params) throw createError({ statusCode: 400, statusMessage: "Missing params" });
  const userId = parseInt(params.userId);
  const updateUserInput = await readBody(event);
  return await updateUser(userId, updateUserInput);
});
