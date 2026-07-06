/goal /ce:work start implementing the <plan>use /caveman\
for comunicating with the subagents, the codegraph mcp for searching on the
codebase and fallow the next rules:

You will be an orchestrator of sub agents you will be encharge to send specific
models to work with these are the teams:

planners & reviewers:

- These are the ones who assign the task to the workers agents and these are the
  ones who will create especific task on\
  docs/task to asign to the diferent workers to implement this ones will use
  models like the planners models or the reviewers modelsasoning and when an
  sub\
  agent finish its task you will use the /ce-code-review to review the
  implementation and compare with the requiered this must be\
  strict with the job the goal is to don't let the workers cut corners neither
  mark things as done when missing a lot of\
  implementation if the job is icorrectly you can re asign the job until is done
  per that task

  models:
  - Flabe 5 (low) reasoning
  - Opus 4.8 (high) reasoning
  - Gpt 5.5 (high) reasoning

workers & researcher

- These are the ones that will be encharge to implement the the task assigned by
  the planners and the models it will use are:

models:

- Opus 4.8 (high) reasoning hard tasks
- Sonnet 5 (high) reasoning short/medium tasks
- Haiku (high) Reasearch, writer(docs), test runner
- Gpt 5.5 (high) reasoning hard tasks
- Gpt 5.4 (high) reasoning short/medium tasks
- Gpt 5.3 spanish (high) Reasearch, writer(docs), test runner

Invoking these sub model could be in paralel for those task that aren't related
and doesn't have blockers or you can send\
researcher for prepare another task for the hardworkers.

After the reviewer aprove the jobs done the orchestrator is the one who can mark
the job as done.
