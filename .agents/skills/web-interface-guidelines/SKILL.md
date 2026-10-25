---
name: web-interface-guidelines
description: Review UI code against Vercel's Web Interface Guidelines (accessibility, focus, forms, animation, typography, images, performance, navigation state, touch, dark mode). Use when asked to "review my UI", "check accessibility", "audit design", or check a page or component against web best practices.
metadata:
  author: vercel (rules), tsvetanski.com (source wrapper), Black Dice Engine (adaptation)
---

# Web Interface Guidelines

Review the given files against the rules in [guidelines.md](guidelines.md), a pinned copy of
`vercel-labs/web-interface-guidelines` `command.md`. Do not fetch the rules from the network;
the pinned copy is the reviewed version.

1. Read `guidelines.md` in full. It contains the rules and the required output format.
2. Read the files the user named. If none were named, infer scope from the current requested change or diff; ask only if no useful review scope is available.
3. Report findings in the `file:line` format the guidelines specify. Group by file.
4. For Black Dice Engine layout, navigation, or mobile behavior, pair this review with [bde-react-ui](../bde-react-ui/SKILL.md) and [bde-verification](../bde-verification/SKILL.md). The portfolio's `web-interaction-review`, Next.js commands, and screenshot scripts are not dependencies.

Apply the pinned rules to the current React/Vite application and its CSS. Tailwind classes, Next.js components, virtualization packages, and URL-state libraries in the examples are illustrative, not installation requirements. Preserve working native keyboard behavior rather than adding duplicate handlers to semantic buttons/links. Judge list performance from evidence rather than an arbitrary item count. Do not place credentials, private search terms, or GM state in URLs. Use existing local conventions for copy and theming; do not redesign working UI simply to match a style preference. Report code findings separately from behavior actually verified in a demo browser.
