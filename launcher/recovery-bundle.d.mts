export interface RecoveryBundleOptions { installRoot: string; passphrase: string; }
export function exportRecoveryBundle(options: RecoveryBundleOptions & { outputPath: string; overwrite?: boolean }): Promise<{ outputPath: string; fileCount: number; plaintextBytes: number; encrypted: true }>;
export function verifyRecoveryBundle(options: { bundlePath: string; passphrase: string }): Promise<{ valid: true; createdAt: string; fileCount: number; totalBytes: number; roots: string[] }>;
export function restoreRecoveryBundle(options: RecoveryBundleOptions & { bundlePath: string; approvedByCreator?: boolean }): Promise<{ restored: true; fileCount: number; roots: string[]; evidencePath: string }>;
