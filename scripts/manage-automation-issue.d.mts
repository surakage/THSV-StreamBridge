export type AutomationIssueKind = 'release-preflight' | 'post-release-smoke' | 'dependency-canary' | 'public-attestation-canary' | 'runtime-cache-canary' | 'toolchain-major-canary';
export type AutomationIssueResult = 'success' | 'failure' | 'cancelled';
export type AutomationIssueAction = 'create' | 'close' | 'comment' | 'none';

export interface AutomationIssueInput {
  kind: AutomationIssueKind;
  result: AutomationIssueResult;
  tag?: string;
  previousResult?: string;
  openIssueNumber?: string;
}

export interface AutomationIssueDecision {
  action: AutomationIssueAction;
  title: string;
  issueNumber: string;
  reason: string;
}

export function decideAutomationIssue(input: AutomationIssueInput): AutomationIssueDecision;
