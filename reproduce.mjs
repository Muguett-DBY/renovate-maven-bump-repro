import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = path.resolve(process.argv[2]);
const expected = process.argv[3];
assert(['broken', 'fixed'].includes(expected), 'Usage: node reproduce.mjs RENOVATE_CHECKOUT broken|fixed');
const fixture = path.dirname(fileURLToPath(import.meta.url));
const runs = path.join(fixture, 'runs');
await fs.mkdir(runs, { recursive: true });
const run = await fs.mkdtemp(path.join(runs, `${expected}-`));
const work = path.join(run, 'checkout');
await fs.mkdir(work);

const load = (file) => import(pathToFileURL(path.join(source, file)).href);
const { GlobalConfig } = await load('lib/config/global.ts');
await (await load('lib/logger/index.ts')).init();
const git = await load('lib/util/git/index.ts');
const { extractAllPackageFiles } = await load('lib/modules/manager/maven/extract.ts');
const { getUpdatedPackageFiles } = await load('lib/workers/repository/update/branch/get-updated.ts');
const { XmlDocument } = createRequire(path.join(source, 'package.json'))('xmldoc');

GlobalConfig.set({ localDir: work, cacheDir: path.join(run, 'cache'), platform: 'github', binarySource: 'global' });
await git.initRepo({ url: fixture, defaultBranch: 'main', currentBranch: 'main' });
await git.syncGit();
const original = await fs.readFile(path.join(work, 'pom.xml'), 'utf8');
const [pkg] = await extractAllPackageFiles({}, ['pom.xml']);
assert.equal(pkg.deps.length, 3);
const targets = {
  'org.apache.maven.plugins:maven-compiler-plugin': '3.16.0',
  'org.apache.maven.plugins:maven-surefire-plugin': '3.5.4',
  'io.smallrye:jandex-maven-plugin': '3.5.0',
};
const upgrades = pkg.deps.map((dep) => ({
  ...dep,
  manager: 'maven',
  branchName: 'renovate/all-non-major',
  packageFile: 'pom.xml',
  packageFileVersion: pkg.packageFileVersion,
  bumpVersion: 'patch',
  newValue: targets[dep.depName],
})).sort((left, right) => right.fileReplacePosition - left.fileReplacePosition);
assert(upgrades.every((upgrade) => upgrade.newValue));

const result = await getUpdatedPackageFiles({
  manager: 'maven',
  baseBranch: 'main',
  branchName: 'renovate/all-non-major',
  reuseExistingBranch: false,
  packageFiles: { maven: [pkg] },
  upgrades,
});
assert.equal(result.updatedPackageFiles.length, 1);
assert.deepEqual(result.artifactErrors, []);
const output = result.updatedPackageFiles[0].contents;
const wanted = original.replace('>1.1.9-SNAPSHOT<', '>1.1.10-SNAPSHOT<')
  .replace('>3.12.1<', '>3.16.0<')
  .replace('>3.2.3<', '>3.5.4<')
  .replace('>3.2.2<', '>3.5.0<');
let validXml = true;
try { new XmlDocument(output); } catch { validXml = false; }
const receipt = {
  node: process.version,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
  expected,
  validXml,
  matchesExpectedOutput: output === wanted,
  dependencyPositions: upgrades.map(({ depName, fileReplacePosition }) => ({ depName, fileReplacePosition })),
  sourceHashes: {},
};
for (const file of ['lib/modules/manager/maven/update.ts', 'lib/workers/repository/update/branch/get-updated.ts']) {
  receipt.sourceHashes[file] = createHash('sha256').update(await fs.readFile(path.join(source, file))).digest('hex');
}
await fs.writeFile(path.join(run, 'updated-pom.xml'), output);
await fs.writeFile(path.join(run, 'result.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
assert.equal(validXml, expected === 'fixed');
assert.equal(output === wanted, expected === 'fixed');
if (expected === 'broken') {
  assert(output.includes('<compiler-plugin.version3.16.0</compiler-plugin.version>'));
  assert(output.includes('<surefire-plugin.version3.5.4</surefire-plugin.version>'));
}
