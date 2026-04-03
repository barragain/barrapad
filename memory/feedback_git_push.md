---
name: Always push git after changes
description: User wants a git push after every code change to see it live on the deployed site
type: feedback
---

After completing any code change, always run `git add` + `git commit` + `git push` so the user can see the changes live on their deployed site immediately.

**Why:** User reviews changes on their live deployment, not just locally. Each session of changes should end with a push.

**How to apply:** At the end of every task that modifies code, commit and push. Ask for confirmation if multiple changes are batched.
