import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { Arch } from 'builder-util';

const SQUASHFS_MAGIC = Buffer.from('hsqs');
const LIBZ = Buffer.from('libz.so');
const LIBZ1 = Buffer.from('libz.so.1');

const logger = (message) => {
  console.log(`[artifactBuildCompleted] ${message}`);
};

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} exited with code ${code}`));
      }
    });
  });

const shouldPatchRuntime = async (filePath) => {
  const data = await fs.readFile(filePath);
  const squashfsOffset = data.indexOf(SQUASHFS_MAGIC);
  if (squashfsOffset === -1) {
    logger(`SquashFS header not found in ${path.basename(filePath)}, skipping`);
    return false;
  }

  const runtime = data.subarray(0, squashfsOffset);
  const hasLibz = runtime.indexOf(LIBZ) !== -1;
  const hasLibz1 = runtime.indexOf(LIBZ1) !== -1;

  return hasLibz && !hasLibz1;
};

export default async function patchAppImageRuntime(artifact) {
  if (!artifact?.file?.endsWith('.AppImage')) {
    return;
  }

  const fileName = path.basename(artifact.file);
  const isArm64 = artifact.arch === Arch.arm64 || fileName.includes('arm64');

  if (!isArm64 || process.platform !== 'linux') {
    return;
  }

  const needsPatch = await shouldPatchRuntime(artifact.file);
  if (!needsPatch) {
    return;
  }

  const patchelf = process.env.PATCHELF || 'patchelf';
  logger(`Patching ${fileName} runtime libz dependency`);

  try {
    await run(patchelf, ['--replace-needed', 'libz.so', 'libz.so.1', artifact.file]);
  } catch (error) {
    throw new Error(
      `Failed to patch AppImage runtime (missing libz.so.1 on target). ` +
        `Ensure '${patchelf}' is installed and retry. Original error: ${error.message}`
    );
  }
}
