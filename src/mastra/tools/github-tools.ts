import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createGitHubIssue, listGitHubIssues } from '@/app/lib/github';

export const createGitHubIssueTool = createTool({
  id: 'create-github-issue',
  description: 'Creates a new issue in a GitHub repository',
  inputSchema: z.object({
    owner: z.string().describe('Repository owner username or organization'),
    repo: z.string().describe('Repository name'),
    title: z.string().describe('Title of the issue'),
    body: z.string().describe('Detailed description or body of the issue'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    issueNumber: z.number().optional(),
    issueUrl: z.string().optional(),
    htmlUrl: z.string().optional(),
    title: z.string().optional(),
    state: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (input) => {
    return await createGitHubIssue({
      owner: input.owner,
      repo: input.repo,
      title: input.title,
      body: input.body,
    });
  },
});

export const listGitHubIssuesTool = createTool({
  id: 'list-github-issues',
  description: 'Lists issues for a GitHub repository',
  inputSchema: z.object({
    owner: z.string().describe('Repository owner username or organization'),
    repo: z.string().describe('Repository name'),
    state: z.enum(['open', 'closed', 'all']).optional().describe('Filter by issue state'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    issues: z
      .array(
        z.object({
          number: z.number(),
          title: z.string(),
          html_url: z.string(),
          state: z.string(),
        })
      )
      .optional(),
    error: z.string().optional(),
  }),
  execute: async (input) => {
    return await listGitHubIssues(input.owner, input.repo, undefined, input.state || 'open');
  },
});
