export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { installation_id } = getQuery(event) as { installation_id: string }
  console.log('installation_id', installation_id)

  await new GithubService(event).handleAppCallback(user.id, installation_id)

  return `
    <script>
      window.opener.postMessage({ installationId: "${installation_id}" }, window.location.origin);
      window.close();
    </script>
    <meta http-equiv="refresh" content="0.1;url=/">
  `
})
