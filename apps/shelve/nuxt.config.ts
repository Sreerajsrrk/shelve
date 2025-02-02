import vue from '@vitejs/plugin-vue'

export default defineNuxtConfig({
  extends: '../base',

  compatibilityDate: '2025-01-24',

  future: {
    compatibilityVersion: 4,
  },

  ssr: false,

  nitro: {
    experimental: {
      openAPI: true
    },
    rollupConfig: {
      // @ts-expect-error - this is not typed
      plugins: [vue()]
    },
    imports: {
      dirs: ['./server/services']
    }
  },

  hub: {
    database: true,
    cache: true,
    blob: true
  },

  /*$development: {
    hub: {
      remote: true
    }
  },*/

  runtimeConfig: {
    session: {
      name: 'shelve_session',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
    github: {
      appPrivateKey: process.env.NUXT_GITHUB_APP_PRIVATE_KEY,
      webhookSecret: process.env.NUXT_GITHUB_WEBHOOK_SECRET,
      appId: process.env.NUXT_GITHUB_APP_ID,
    },
    private: {
      resendApiKey: '',
      encryptionKey: process.env.NUXT_PRIVATE_ENCRYPTION_KEY,
      adminEmails: process.env.NUXT_PRIVATE_ADMIN_EMAILS
    },
    public: {
      githubAppSlug: process.env.NUXT_GITHUB_APP_SLUG,
    }
  },

  modules: [
    '@vueuse/nuxt',
    'nuxt-auth-utils',
    '@nuxthub/core',
  ],
})
