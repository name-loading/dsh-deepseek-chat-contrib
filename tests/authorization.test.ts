import assert from 'node:assert/strict'
import test from 'node:test'
import { AuthorizationAuthority, PROFILE_CONTEXT_UNAVAILABLE } from '../src/authorization.js'
import { authorizationSchema, clientMetadataSchema, websiteSessionSchema } from '../src/protocol.js'
const metadata = { version: '0.2.0-rc.2', locale: 'zh-CN', timezoneOffsetSeconds: 28800 }

test('Host profile availability is independent of DSH account sign-in', async t => {
  const auth = new AuthorizationAuthority('profile-a', () => 'epoch-1'); t.after(() => auth.dispose())
  assert.deepEqual(await auth.refresh(metadata), { status: 'authorized', accountId: 'profile-a', epoch: 'epoch-1', error: null })
  assert.deepEqual(await auth.refresh(metadata), auth.getSnapshot())
})
test('missing trusted profile permits volatile website use but reports unavailable persistence', async t => {
  const auth = new AuthorizationAuthority(null, () => 'volatile'); t.after(() => auth.dispose())
  const state = await auth.refresh(metadata)
  assert.equal(state.status, 'authorized'); assert.equal(state.accountId, 'chat-volatile:volatile')
  assert.equal(state.error, PROFILE_CONTEXT_UNAVAILABLE)
})
test('disposal closes the Host epoch and releases an idle stream', async () => {
  let epoch = 0; const auth = new AuthorizationAuthority('profile-a', () => 'epoch-' + ++epoch)
  const abort = new AbortController(); const iterator = auth.watch(metadata, abort.signal)[Symbol.asyncIterator]()
  assert.equal((await iterator.next()).value?.status, 'authorized')
  const pending = iterator.next(); auth.dispose()
  assert.equal((await pending).done, true); assert.equal(auth.getSnapshot().status, 'unauthorized')
  assert.equal(auth.getSnapshot().epoch, 'epoch-2'); await assert.rejects(auth.refresh(metadata), /disposed/)
})
test('aborting a stream does not revoke Host availability', async t => {
  const auth = new AuthorizationAuthority('profile-a'); t.after(() => auth.dispose())
  const abort = new AbortController(); const iterator = auth.watch(metadata, abort.signal)[Symbol.asyncIterator]()
  await iterator.next(); const pending = iterator.next(); abort.abort()
  assert.equal((await pending).done, true); assert.equal((await auth.refresh(metadata)).status, 'authorized')
})
test('credential-free projections reject extra credential fields', () => {
  assert.throws(() => clientMetadataSchema.parse({ ...metadata, token: 'fictional' }))
  assert.throws(() => authorizationSchema.parse({ status: 'authorized', accountId: 'a', epoch: 'a', error: null, cookie: 'fictional' }))
  const session = { token: 'fictional', userId: 'fictional-user', deviceId: '00000000-0000-4000-8000-000000000001' }
  assert.deepEqual(websiteSessionSchema.parse(session), session)
  for (const extra of ['cookie', 'password', 'origin', 'credentialKey']) assert.throws(() => websiteSessionSchema.parse({ ...session, [extra]: 'fictional' }))
  for (const key of ['token', 'userId', 'deviceId']) assert.throws(() => websiteSessionSchema.parse({ ...session, [key]: '' }))
})
