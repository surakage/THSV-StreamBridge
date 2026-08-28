export interface PublicReleaseAsset { readonly name: string; readonly size: number }
export interface PublicReleaseValidationInput { readonly directory: string; readonly repository: string; readonly tag: string; readonly releaseAssets: readonly PublicReleaseAsset[] }
export interface AttestationMatchInput { readonly expectedDigest: string; readonly kind: 'provenance' | 'sbom'; readonly expectedSbom?: unknown }
export function validatePublicReleaseAssets(input: PublicReleaseValidationInput): Promise<Readonly<{ archiveName: string; sbomName: string; evidenceName: string; indexName: string; addOnArchives: readonly string[]; selectedNames: readonly string[]; provenanceAssets: readonly string[] }>>;
export function attestationStatementMatches(statement: unknown, input: AttestationMatchInput): boolean;
export function stableJson(value: unknown): string | undefined;
