export interface DownloadGitHubArtifactOptions { repository: string; artifactId: number | string; expectedDigest: string; outputPath: string; token?: string; fetcher?: typeof fetch }
export function downloadGitHubArtifact(options: DownloadGitHubArtifactOptions): Promise<{ schemaVersion: number; repository: string; artifactId: number; digest: string; bytes: number; outputPath: string }>;
