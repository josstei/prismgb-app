import path from 'node:path';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import crypto from 'node:crypto';
import { TRANSCODE_CONFIG } from './transcode.config.js';
import type { LoggerLike } from '@platform/core';

export interface SessionInfo { sessionId: string; sessionDir: string }
const baseDirectory = (tempDir: string) => path.join(tempDir, 'prismgb-transcode');

export function createTempSession(tempDir: string): SessionInfo {
  const sessionId = `${TRANSCODE_CONFIG.tempPrefix}${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const sessionDir = path.join(baseDirectory(tempDir), sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  return { sessionId, sessionDir };
}

export async function writeTempFile(sessionDir: string, filename: string, buffer: Buffer): Promise<string> {
  const filePath = path.join(sessionDir, filename);
  await fsPromises.writeFile(filePath, buffer);
  return filePath;
}

export function cleanupSession(sessionDir: string, logger: Pick<LoggerLike, 'warn'>): void {
  try {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  } catch (error) {
    logger.warn('Failed to clean up transcode session', { sessionDir, error });
  }
  // A non-recursive removal can only remove the now-empty parent; another
  // profile/runtime may still own sessions in this shared temporary directory.
  try {
    fs.rmdirSync(path.dirname(sessionDir));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOTEMPTY' && code !== 'EEXIST' && code !== 'ENOENT') {
      logger.warn('Failed to clean up transcode directory', { sessionDir, error });
    }
  }
}
