import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { build } from 'esbuild'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testsDirectory = path.join(projectRoot, 'tests')
const requested = process.argv.slice(2)
const files = (await readdir(testsDirectory)).filter(file => file.endsWith('.test.ts')
  && (requested.length === 0 || requested.includes(file))).sort()
if (files.length === 0) throw new Error('No tests/*.test.ts files found')
const cacheDirectory = path.join(projectRoot, 'node_modules', '.cache')
await mkdir(cacheDirectory, { recursive: true })
const outputDirectory = await mkdtemp(path.join(cacheDirectory, 'dsh-chat-tests-'))
let exitCode = 1
try {
  await build({
    absWorkingDir: projectRoot,
    entryPoints: files.map(file => path.join('tests', file)),
    outdir: outputDirectory,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    packages: 'external',
    format: 'esm',
    platform: 'node',
    target: 'node22',
    plugins: [{
      // Client DI integration tests exercise the real controller while keeping
      // presentation modules inert. Native guest/React behavior is not tested here.
      name: 'client-controller-presentation-fixtures',
      setup(plugin) {
        plugin.onResolve({ filter: /^\.\/(?:ui|web-surface|handoff-ui)\.js$/ }, args => {
          if (path.resolve(args.importer) !== path.join(projectRoot, 'src/client.ts')) return
          return { path: args.path, namespace: 'client-di-fixture' }
        })
        plugin.onLoad({ filter: /.*/, namespace: 'client-di-fixture' }, args => ({
          contents: args.path === './handoff-ui.js' ? 'export const DshChatHandoffDialog = () => null; export const DshChatHandoffInsertion = () => null;' : args.path === './ui.js'
            ? 'export const guardHarnessSearchReplay = () => () => {}; export const DshChatBrandName = () => null; export const DshChatBrandControl = () => null; export const DshChatChatNavigation = () => null; export const DshChatChatPanel = () => null; export const DshChatLeadingControls = () => null; export const DshChatChatSettings = () => null;'
            : 'export const DshChatWebSurface = () => null;',
          loader: 'js',
        }))
      },
    }],
  })
  const result = spawnSync(process.execPath, [
    '--test', '--test-reporter=spec',
    ...files.map(file => path.join(outputDirectory, file.replace(/\.ts$/, '.mjs'))),
  ], { cwd: projectRoot, stdio: 'inherit' })
  if (result.error) throw result.error
  exitCode = result.status ?? 1
} finally {
  await rm(outputDirectory, { recursive: true, force: true })
}
process.exitCode = exitCode
