/**
 * GitHub API integration helper
 * Handles repo parsing, issue creation, issue fetching, and resolution commentary
 */

export interface GitHubIssuePayload {
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels?: string[];
}

export interface GitHubIssueResult {
  success: boolean;
  issueNumber?: number;
  issueUrl?: string;
  htmlUrl?: string;
  title?: string;
  state?: string;
  error?: string;
}

export const DEFAULT_REPO_OWNER = "dhanvin-gowda";
export const DEFAULT_REPO_NAME = "multi_agent_website";

/**
 * Parses user speech/text transcript to detect GitHub action and extract repository details
 */
export function parseGitHubIntent(text: string): {
  isGitHubTask: boolean;
  action: "create_issue" | "solve_issue" | "list_issues" | "repo_query" | "none";
  owner: string;
  repo: string;
  title?: string;
  issueNumber?: number;
  cleanQuery: string;
} {
  const isGitHubRelated =
    /\b(github|repo|repository|issue|issues|pull request|pr|branch|commit|git)\b/i.test(text);

  if (!isGitHubRelated) {
    return {
      isGitHubTask: false,
      action: "none",
      owner: DEFAULT_REPO_OWNER,
      repo: DEFAULT_REPO_NAME,
      cleanQuery: text,
    };
  }

  // Extract owner/repo if mentioned (e.g. "dhanvin-gowda/multi_agent_website" or "in repo foo/bar")
  let owner = DEFAULT_REPO_OWNER;
  let repo = DEFAULT_REPO_NAME;

  const repoMatch = text.match(/(?:repository|repo)\s+([a-zA-Z0-9_\-\.]+)\/([a-zA-Z0-9_\-\.]+)/i) ||
    text.match(/([a-zA-Z0-9_\-\.]+)\/([a-zA-Z0-9_\-\.]+)/);
  if (repoMatch) {
    owner = repoMatch[1];
    repo = repoMatch[2];
  }

  // Check issue number (e.g. "issue #3" or "issue number 3" or "issue 3")
  let issueNumber: number | undefined;
  const issueNumMatch = text.match(/(?:issue|#)\s*#?([0-9]+)/i);
  if (issueNumMatch) {
    issueNumber = parseInt(issueNumMatch[1], 10);
  }

  // Determine specific action
  let action: "create_issue" | "solve_issue" | "list_issues" | "repo_query" = "repo_query";

  if (/\b(create|open|file|new|make|raise|submit)\b.*\b(issue|bug|ticket)\b/i.test(text) ||
      /\b(issue)\b.*\b(create|open|file|new|raise)\b/i.test(text)) {
    action = "create_issue";
  } else if (/\b(solve|fix|resolve|debug|patch|close|repair)\b.*\b(issue|bug|error)\b/i.test(text) ||
             /\b(issue|bug)\b.*\b(solve|fix|resolve|patch)\b/i.test(text)) {
    action = "solve_issue";
  } else if (/\b(list|show|fetch|get|check|find)\b.*\b(issues|bugs)\b/i.test(text) ||
             /\b(open issues|all issues)\b/i.test(text)) {
    action = "list_issues";
  }

  // Attempt to extract title for create issue
  let title: string | undefined;
  const titleQuotesMatch = text.match(/(?:titled|title|named|called)\s+["']([^"']+)["']/i);
  if (titleQuotesMatch) {
    title = titleQuotesMatch[1];
  } else {
    const titledMatch = text.match(/(?:titled|title)\s+([^,.;\n]+)/i);
    if (titledMatch) {
      title = titledMatch[1].trim();
    }
  }

  return {
    isGitHubTask: true,
    action,
    owner,
    repo,
    title,
    issueNumber,
    cleanQuery: text,
  };
}

/**
 * Creates an issue on GitHub using REST API
 */
export async function createGitHubIssue(
  params: GitHubIssuePayload,
  token?: string
): Promise<GitHubIssueResult> {
  const authToken = token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!authToken) {
    return {
      success: false,
      error: "GitHub token not configured (set GITHUB_TOKEN in environment)",
    };
  }

  try {
    const url = `https://api.github.com/repos/${params.owner}/${params.repo}/issues`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${authToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "MultiAgent-Voice-CodingAgent",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        labels: params.labels || ["agent-created", "bug"],
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        success: false,
        error: `GitHub API error (${res.status}): ${errorText}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      issueNumber: data.number,
      issueUrl: data.url,
      htmlUrl: data.html_url,
      title: data.title,
      state: data.state,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error creating GitHub issue";
    return { success: false, error: msg };
  }
}

/**
 * Fetches repository issues
 */
export async function listGitHubIssues(
  owner: string,
  repo: string,
  token?: string,
  state: "open" | "closed" | "all" = "open"
): Promise<{ success: boolean; issues?: Array<{ number: number; title: string; html_url: string; state: string }>; error?: string }> {
  const authToken = token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "MultiAgent-Voice-CodingAgent",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=${state}&per_page=10`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `GitHub API error (${res.status}): ${err}` };
    }
    const data = await res.json();
    return {
      success: true,
      issues: Array.isArray(data)
        ? data.map((item: { number: number; title: string; html_url: string; state: string }) => ({
            number: item.number,
            title: item.title,
            html_url: item.html_url,
            state: item.state,
          }))
        : [],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error listing GitHub issues";
    return { success: false, error: msg };
  }
}
