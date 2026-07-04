---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# React Rules

- Don't use arbitrary `useEffect` or `useState` hooks, these hooks are not safe and can cause memory leaks and other issues.
- Don't use arbitrary `useContext` hooks, instead use the `use` api which is a new api for calling the context and is safe and secure.
- Don't use `useEffect` to fetch data, instead use the `useQuery` hook to fetch the data from `@tanstack/react-query`.
- When using `useQuery` to fetch data, we already have configured `orpc` to fetch the data from the server and is safe and secure.
- use the `useRouteContext` hook to get the context and use or convex query to fetch the data or use the `useQuery` hook to fetch the data.
- to fetch data from from convex, use the `useQuery` hook that is re-exported from `src/lib/rpc/index.tsx` this hook works similar to `@tanstack/react-query` but is optimized for convex and is safe and secure.
- use Jotai for UI state management.
- with Jotai for those multiple state management, use the `atomWithReducer` atom to manage the state and is safe and secure.
