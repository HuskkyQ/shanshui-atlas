import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory() && entry.name !== 'data') result.push(...(await files(path)));
    else if (entry.isFile() && entry.name.endsWith('.js')) result.push(path);
  }
  return result;
}

const paths = await files('src');
const failures = [];
for (const path of paths) {
  const status = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['--check', path], { stdio: 'ignore' });
    child.once('exit', resolve);
  });
  if (status !== 0) failures.push(path);
}
if (failures.length) {
  console.error(`JavaScript syntax errors in ${failures.length} file(s):\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`JavaScript syntax check passed for ${paths.length} source files.`);
}
