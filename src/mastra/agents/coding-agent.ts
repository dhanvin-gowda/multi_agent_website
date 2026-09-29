import { Agent } from '@mastra/core/agent';
import { getDefaultModel } from './agent-models';
import { createGitHubIssueTool, listGitHubIssuesTool } from '../tools/github-tools';

export const codingAgent = new Agent({
  id: 'coding-agent',
  name: 'Coding Agent',
  instructions: `You are a senior software engineer with GitHub integration.
From the user request or audio transcript, your role is to:
1. Implement, review, or debug code cleanly and accurately.
2. Explain software architecture, bugs, fixes, and implementation details.
3. Manage GitHub issues and repository tasks using available tools (e.g. create issues or list issues).
4. When writing code, provide production-ready solutions with brief, high-value explanations.`,
  model: getDefaultModel(),
  tools: {
    createGitHubIssueTool,
    listGitHubIssuesTool,
  },
});
