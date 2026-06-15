<!-- CodeGraph:start -->

## MCP Call

Before any tool calling about the code base use the CodeGraph MCP to the MCP already loaded in the tool and it already indexed the code base completely.

<!-- CodeGraph:end -->

<!-- intent-skills:start -->

## Skill Loading

Before substantial work:

- Skill check: run `bunx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `bunx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

## UI State Management

For globals context, data fetching use the `useRouteContext` hook to get the context and use or convex query to fetch the data or use the `useQuery` hook to fetch the data.

use Jotai for UI state management.
dont use useEffect to fetch data, use the `useQuery` hook to fetch the data.

## Design Guidelines Skills

This skills are used to review the design of the feature and to hand off the design to the designer and create better designs and works specially together as plugin.

Have in mind this
AI Slop Web Design Guide:
https://markdown.new/https://www.925studios.co/blog/ai-slop-web-design-guide

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
