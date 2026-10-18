import schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'
import type { Context } from '@deepseek-ai/cordis'
import { DshChatController } from './server.js'
import { DEFAULT_WEBSITE_LANGUAGE } from './identity.js'
import { DshChatHandoffController } from './handoff-server.js'

export const Config = schema.object({
  language: schema.union(['', 'system', 'zh-CN', 'en']).default(DEFAULT_WEBSITE_LANGUAGE).volatile(),
})

export const name = 'dsh-deepseek-chat'

/** Host-half entry. Browser UI is declared separately by the `dsh.client` manifest. */
export const inject = ['typert', 'credentials']

export function apply(ctx: Context): void { new DshChatController(ctx)
  new DshChatHandoffController(ctx)
  ctx.inject(['settings'], child => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
