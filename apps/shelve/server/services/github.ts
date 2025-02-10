import jwt from 'jsonwebtoken'
import type { H3Event } from 'h3'
import type { GithubApp, GitHubAppResponse, GitHubRepo } from '@types'
import { Octokit } from '@octokit/core'
import { restEndpointMethods } from '@octokit/plugin-rest-endpoint-methods'
import { paginateRest } from '@octokit/plugin-paginate-rest'
import { createAppAuth, createOAuthUserAuth } from '@octokit/auth-app'

import nacl from 'tweetnacl'
import { blake2b } from 'blakejs'

function deriveNonce(
  ephemeralPublicKey: Uint8Array,
  recipientPublicKey: Uint8Array
): Uint8Array {
  const input = new Uint8Array(
    ephemeralPublicKey.length + recipientPublicKey.length
  )
  input.set(ephemeralPublicKey, 0)
  input.set(recipientPublicKey, ephemeralPublicKey.length)
  return blake2b(input, undefined, nacl.box.nonceLength)
}

function cryptoBoxSeal(
  message: Uint8Array,
  recipientPublicKey: Uint8Array
): Uint8Array {
  const ephemeralKeyPair = nacl.box.keyPair()
  const nonce = deriveNonce(ephemeralKeyPair.publicKey, recipientPublicKey)
  const encryptedMessage = nacl.box(
    message,
    nonce,
    recipientPublicKey,
    ephemeralKeyPair.secretKey
  )
  const sealedBox = new Uint8Array(
    ephemeralKeyPair.publicKey.length + encryptedMessage.length
  )
  sealedBox.set(ephemeralKeyPair.publicKey, 0)
  sealedBox.set(encryptedMessage, ephemeralKeyPair.publicKey.length)
  return sealedBox
}

export function useOctokitUser(accessToken: string) {
  const restOctokit = Octokit.plugin(restEndpointMethods, paginateRest)
  return new restOctokit({
    authStrategy: createOAuthUserAuth,
    auth: {
      clientId: process.env.NUXT_OAUTH_GITHUB_CLIENT_ID,
      clientSecret: process.env.NUXT_OAUTH_GITHUB_CLIENT_SECRET,
      type: 'oauth-app',
      token: accessToken
    }
  })
}

export class GithubService {

  private readonly GITHUB_API = 'https://api.github.com'
  private readonly tokenCache = new Map<string, { token: string; expiresAt: Date }>()
  private readonly encryptionKey: string
  private readonly webhookSecret: string
  private readonly appPrivateKey: string

  constructor(event: H3Event) {
    const runtimeConfig = useRuntimeConfig(event)
    const { webhookSecret, appPrivateKey } = runtimeConfig.github
    this.encryptionKey = runtimeConfig.private.encryptionKey
    this.webhookSecret = webhookSecret
    this.appPrivateKey = appPrivateKey
    if (!this.encryptionKey) {
      console.error('Encryption key is not defined in runtime config!')
    }
  }

  private async encryptValue(value: string): Promise<string> {
    return await seal(value, this.encryptionKey)
  }

  private async decryptValue(value: string): Promise<string> {
    return (await unseal(value, this.encryptionKey)) as string
  }

  async handleAppCallback(userId: number, installationId: string) {
    await useDrizzle().insert(tables.githubApp).values({
      installationId,
      userId: userId
    })
  }

  private async getAuthToken(userId: number) {
    const app = await useDrizzle().query.githubApp.findFirst({
      where: eq(tables.githubApp.userId, userId)
    })
    if (!app)
      throw createError({
        statusCode: 404,
        statusMessage: 'GitHub App not found'
      })

    return this.useOctokitInstallation(+app.installationId)
  }

  useOctokitInstallation(installationId: number) {
    const base64DecodedPrivateKey = Buffer.from(this.appPrivateKey, 'base64').toString('utf-8')
    const restOctokit = Octokit.plugin(restEndpointMethods, paginateRest)
    return new restOctokit({
      authStrategy: createAppAuth,
      auth: {
        appId: process.env.NUXT_OAUTH_GITHUB_CLIENT_ID,
        clientSecret: process.env.NUXT_OAUTH_GITHUB_CLIENT_SECRET,
        privateKey: base64DecodedPrivateKey,
        installationId
      }
    })
  }

  async getUserRepos(
    userId: number,
    accessToken: string,
    query?: string
  ): Promise<GitHubRepo[]> {
    const octokit = useOctokitUser(accessToken)

    const installationId = await this.getUserApps(userId).then(apps => apps[0].installationId)

    const repositories = await octokit.paginate(
      octokit.rest.apps.listInstallationReposForAuthenticatedUser,
      {
        installation_id: Number.parseInt(installationId),
        per_page: 100
      }
    )

    try {
      if (!query) return repositories

      return repositories.filter((repo) => repo.name.toLowerCase().includes(query.toLowerCase()))
    } catch (error: any) {
      console.log(error)
      throw createError({
        statusCode: error.status || 500,
        statusMessage: `Failed to fetch repositories: ${error.message}`
      })
    }
  }

  async sendSecrets(
    userId: number,
    repository: string,
    variables: { key: string; value: string }[]
  ) {
    try {
      const token = await this.getAuthToken(userId)

      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { key_id, key } = await $fetch<{
        key_id: string
        key: string
      }>(`${this.GITHUB_API}/repos/${repository}/actions/secrets/public-key`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      })

      const binaryPublicKey = Uint8Array.from(
        Buffer.from(key, 'base64')
      )

      for (const { key: secretKey, value: secretValue } of variables) {
        try {
          const binarySecretValue = new TextEncoder().encode(secretValue)
          const encryptedBytes = cryptoBoxSeal(
            binarySecretValue,
            binaryPublicKey
          )
          const encryptedValue = Buffer.from(encryptedBytes).toString('base64')

          await $fetch(`${this.GITHUB_API}/repos/${repository}/actions/secrets/${secretKey}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github.v3+json'
            },
            body: {
              encrypted_value: encryptedValue,
              key_id: key_id
            }
          })
        } catch (error: any) {
          throw createError({
            statusCode: 500,
            statusMessage: `Failed to encrypt or send secret ${secretKey}: ${error.message}`
          })
        }
      }

      return {
        statusCode: 201,
        message: 'Secrets successfully encrypted and sent to GitHub repository'
      }
    } catch (error: any) {
      throw createError({
        statusCode: error.status || 500,
        statusMessage: `Failed to process secrets: ${error.message}`
      })
    }
  }

  getUserApps(userId: number) {
    return useDrizzle().query.githubApp.findMany({
      where: eq(tables.githubApp.userId, userId)
    })
  }

  async deleteApp(userId: number) {
    await useDrizzle()
      .delete(tables.githubApp)
      .where(eq(tables.githubApp.userId, userId))

    return {
      statusCode: 200,
      message: 'App removed from Shelve. Dont forget to delete it from GitHub',
    }
  }

}
