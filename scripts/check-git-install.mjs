import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { checkArtifact } from './check-artifact.mjs'
import { verifyDistributionManifest } from './distribution-manifest.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pnpm = process.env.DSH_CHAT_INSTALL_PNPM ?? process.env.npm_execpath
assert(pnpm, 'Run through pnpm check:git-install with DSH_CHAT_INSTALL_PNPM set to the DSH pnpm entry.')
const expected = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'))

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.stdout) process.stdout.write(result.stdout.replaceAll('\0', '\n'))
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  assert.equal(result.status, 0, `${command} ${args[0]} failed`)
  return result.stdout
}

function runGit(args, cwd) {
  return run('git', [
    '-c', 'core.hooksPath=/dev/null', '-c', 'core.excludesFile=/dev/null',
    '-c', 'commit.gpgsign=false', ...args,
  ], cwd)
}

/** Collect only public source/script files; hidden files and dependency trees are never copied. */
async function collectFiles(relative, codeOnly = false) {
  const files = []
  for (const entry of (await readdir(path.join(projectRoot, relative), { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith('.') || ['node_modules', 'artifacts', 'storage'].includes(entry.name)) continue
    const next = path.posix.join(relative, entry.name)
    assert(!entry.isSymbolicLink(), `Fixture must not copy a symlink: ${next}`)
    if (entry.isDirectory()) files.push(...await collectFiles(next, codeOnly))
    else if (entry.isFile() && (!codeOnly || /\.(?:[cm]?js|tsx?|css|sh)$/.test(entry.name))) files.push(next)
  }
  return files
}

async function requireArtifact(relative) {
  let info
  try { info = await stat(path.join(projectRoot, relative)) } catch {
    assert.fail(`Missing prebuilt artifact ${relative}. Run pnpm release:prepare before this check; Git installation must not build it.`)
  }
  assert(info.isFile(), `Expected a prebuilt regular file: ${relative}`)
}

// An install that needs prepare/install scripts does not satisfy the default-policy contract.
for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack', 'prepublish', 'prepublishOnly', 'publish', 'build']) {
  assert(!expected.scripts?.[hook]?.trim(), `Remove the ${hook} hook: the prebuilt Git package must install without lifecycle approval.`)
}
assert(!expected.workspaces, 'Git distribution must not require a workspace build')
assert.equal(expected.main, './lib/index.js')
assert.equal(expected.exports?.['./client']?.default, './lib/client.js')
for (const item of ['lib/index.js', 'lib/client.js', 'lib/types/index.d.ts', 'lib/types/client.d.ts', 'lib/build-manifest.json', 'cordis.patch.yml', 'assets/icon.svg']) {
  await requireArtifact(item)
}
await checkArtifact(projectRoot)
await verifyDistributionManifest(projectRoot)

const libFiles = await collectFiles('lib')
const releaseFiles = [...libFiles, 'cordis.patch.yml', 'assets/icon.svg', 'README.md']
const fixtureFiles = [...new Set([
  '.gitattributes', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', ...releaseFiles,
  ...await collectFiles('src', true), ...await collectFiles('scripts', true),
])]
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'dsh-chat-git-install-'))
const source = path.join(temporaryRoot, 'source')
const consumer = path.join(temporaryRoot, 'consumer')
// A sibling store keeps Git's temporary checkout outside the consumer's workspace.
const store = path.join(temporaryRoot, 'store')

try {
  await mkdir(source)
  await mkdir(consumer)
  for (const file of fixtureFiles) {
    await mkdir(path.dirname(path.join(source, file)), { recursive: true })
    await cp(path.join(projectRoot, file), path.join(source, file))
  }
  await writeFile(path.join(source, '.gitignore'), 'node_modules/\nartifacts/\n')
  runGit(['init', '--quiet'], source)
  runGit(['add', '--all'], source)
  runGit([
    '-c', 'user.name=Installation fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '--quiet', '-m', 'Prebuilt installation fixture',
  ], source)
  const tracked = runGit(['ls-files', '-z', '--', 'lib'], source).split('\0').filter(Boolean).sort()
  assert.deepEqual(tracked, [...libFiles].sort(), 'The Git fixture must contain every prebuilt lib file.')
  const sha = runGit(['rev-parse', 'HEAD'], source).trim()
  const specifier = `git+${pathToFileURL(source).href}#${sha}`

  await writeFile(path.join(consumer, 'package.json'), JSON.stringify({
    name: 'dsh-chat-default-policy-consumer', private: true, type: 'module',
  }))
  const version = run(process.execPath, [pnpm, '--version'], consumer).trim()
  assert.match(version, /^11\.\d+\.\d+(?:[-+].*)?$/, 'Use the DSH pnpm 11 runtime via DSH_CHAT_INSTALL_PNPM for this acceptance check.')

  // No workspace policy, build-approval arguments, or script bypass is supplied.
  run(process.execPath, [
    pnpm, 'add', specifier, '--store-dir', store, '--reporter=append-only',
  ], consumer)

  const installed = path.join(consumer, 'node_modules', expected.name)
  const actual = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'))
  for (const field of ['name', 'version', 'main', 'types', 'exports', 'dsh', 'icon', 'dependencies', 'peerDependencies']) {
    assert.deepEqual(actual[field], expected[field], `Installed manifest ${field} differs from the release fixture.`)
  }
  for (const file of releaseFiles) {
    assert.deepEqual(
      await readFile(path.join(installed, file)),
      await readFile(path.join(source, file)),
      `Installed release file differs from the Git fixture: ${file}`,
    )
  }
  const installedLib = []
  async function collectInstalledLib(relative) {
    for (const entry of await readdir(path.join(installed, relative), { withFileTypes: true })) {
      const next = path.posix.join(relative, entry.name)
      if (entry.isDirectory()) await collectInstalledLib(next)
      else { assert(entry.isFile(), `Unexpected installed lib entry: ${next}`); installedLib.push(next) }
    }
  }
  await collectInstalledLib('lib')
  assert.deepEqual(installedLib.sort(), [...libFiles].sort(), 'Installed lib file list differs from the Git fixture.')
  await checkArtifact(installed)
  run(process.execPath, ['--input-type=module', '-e',
    `const p = await import(${JSON.stringify(expected.name)}); if (p.name !== ${JSON.stringify(expected.name)} || typeof p.apply !== 'function') process.exit(1); console.log('Installed prebuilt Git package Host import passed.');`,
  ], consumer)
  console.log(`Prebuilt Git install passed for ${actual.name}@${actual.version}: default pnpm 11 policy, unchanged release files, Host import, and lazy Client registration.`)
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
