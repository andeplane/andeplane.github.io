/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MIXPANEL_TOKEN?: string
  readonly VITE_MIXPANEL_API_HOST?: string
}

declare module '*.md' {
  const content: string
  export default content
}
