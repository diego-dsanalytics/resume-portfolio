# Agent instructions: resume-portfolio

Diego Scalioni's interactive resume, a public static site on GitHub Pages:
<https://diego-dsanalytics.github.io/resume-portfolio/>. `README.md` is the human guide; this file is what an agent needs to change the repo safely.

## Ground rules

- **`main` is the live site.** GitHub Pages deploys from `main`, folder `/ (root)`, so anything that lands on `main` goes public right away.
  - Create a branch before editing anything. Use a short descriptive kebab-case name, such as `translate-conference-name`.
  - Commit only when the user asks. Never push.
  - Publishing means merging the branch into `main` locally and pushing `main`, and only when the user explicitly says so. No pull requests.
- **Never invent resume content.** Word, shorten and translate facts the user gives you, but never make up achievements, numbers, employers, dates, skills or certifications. Empty `summary` and `highlights` fields are intentional: leave them empty until the user provides the facts.
- **Privacy.** The repo and site are public and scraped. Never add a phone number, a city of residence (the profile only says "Portugal"), a home address or the original PDF CV. Ask before adding any other personal data.
- **No build step and no dependencies.** Plain HTML, CSS and vanilla JavaScript; Google Fonts is the only external request. Don't add a framework, bundler, `package.json`, CDN script or analytics without the user's approval.
- **`C:\Users\diego\Documents\Repos\certification-plan` is read-only.** You may read it for patterns, but never modify it, and use absolute paths instead of `cd` into it.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | Static shell: top bar, empty section containers, the drawer `<dialog>`. Interface text uses `data-i18n` / `data-i18n-label` keys |
| `js/app.js` | All behavior, in one IIFE: localization, rendering, skill filter, timeline, drawer, data checks |
| `css/styles.css` | Tokens, components, responsive rules (880px and 680px), reduced motion and print |
| `data/resume.json` | All content and all interface wording, in both languages |
| `assets/badges/` | Certification badge images, referenced by a certification's `badge` path |
| `assets/flags/` | Language flags; a language's `flag` value is the file name without `.svg` |
| `.claude/launch.json` | Preview server `resume`: `python -m http.server 8124` |
| `.nojekyll` | Keeps GitHub Pages from running Jekyll. Don't delete |

All paths are relative so the site works under `/resume-portfolio/` or at a domain root. Keep them relative.

## Editing content (`data/resume.json`)

Most requests are content changes and need no code. The README documents the schema; the rules that are easy to get wrong:

- **Translations.** Any text value can be `{ "en": "...", "pt": "..." }`. A plain value is used in both languages, and a missing `pt` falls back to `en`. Portuguese is Brazilian Portuguese (`pt-BR`). Whenever you add or change English text that a Brazilian reader would see differently, add or update the `pt` text too. Proper names (companies, certifications, products) usually stay plain.
- **Skills are matched by `name`, which is always plain English.** A role's, work item's or certification's `skills` entries must match a `skills[].name` exactly. To translate a skill, give it a `label` object; never translate `name`. `group` sets its toolkit heading.
- **Role `id`s are public links** (`#role-<id>`). Don't rename an existing one. New ids follow `<company>-<role>` in kebab-case and must be unique.
- **Order.** Companies in `experience` and roles inside a company are newest first; the timeline draws rows in that order. Certifications are newest first within each group.
- **Dates** are `"YYYY-MM"` strings. A current role has `"end": null`. Education uses plain years.
- **Phases** (`data`, `support`, `operations`, `teaching`) each have a matching CSS color. A new phase needs a `phases` entry plus `--phase-<id>` tokens (light and both dark blocks) and `.bar--<id>` rules in `css/styles.css`, including the 680px list and the legend swatch.
- **Certifications.** `group` must match a `certificationGroups[].id`. Don't hand-edit dates when a certification lapses: the page derives it from `expires`. Set `"retired": true` only when the issuer withdrew the exam. A badge needs an image in `assets/badges/` named after the exam code in lowercase (`dp-700.png`).
- **Certification details** (`about`, `domains`, `validity`, `url`, `studyGuideUrl`, `credentialUrl`) feed the certification drawer. Groups with `"drawer": false` (`professional`, `training`) have no drawer, so don't add details there. Take `about` and `domains` from the official study guide (the Microsoft Learn MCP server is the quickest source), never from memory. List `domains` only for certifications the user keeps current through renewal, because a non-renewing exam's current skills may not be the ones they were tested on. `credentialUrl` is the user's own verification link: only add one they give you. The link id (`#cert-<id>`) comes from `id`, otherwise `code`, otherwise the English name, so don't change those for a certification that may have been shared.
- **Work items** take either `date` (`"YYYY-MM"`) or a free-text `period`, and either one `url` (with an optional `linkLabel`) or a `links` list.
- **Interface wording** lives in `ui`. A new `data-i18n` key in `index.html` or `t("key")` call in `app.js` needs an entry in `ui` with both languages. Plural entries are `[singular, plural]` arrays.
- **Profile link icons** are limited to the keys in `ICONS` in `app.js` (`linkedin`, `github`, `microsoft`, `mail`).
- Keep the existing formatting: 2-space indentation, one role, certification or skill per line. A certification with drawer details is expanded instead: the basic fields on its first line, then one line per detail field and one line per domain.

## Code conventions

- **JavaScript:** vanilla ES2020+, `"use strict"` inside the IIFE, double quotes, semicolons, 2-space indentation. Build DOM nodes with the `el()` helper; never use `innerHTML` or insert data as HTML. Query with `$` / `$$`. Wrap any `localStorage` access in the `store` helper (it can throw). Every visible string comes from `resume.json` via `t()` or the localized data, never hard-coded, except the load-error and `<noscript>` fallbacks.
- **Rendering:** `render()` redraws the whole page from `state.raw` and runs again on every language change. New render functions must be idempotent (`replaceChildren`) and get called from `render()`.
- **Filtering:** an element joins the skill filter by carrying `data-role="<id>"` or `data-skills='[...]'`; `applyFilter()` toggles `.is-dim`.
- **Data checks:** `validate()` warns in the console with a `[resume]` prefix. Extend it when you add a field that references another part of the data.
- **CSS:** colors only through the custom properties in `:root`. A new token goes in all three theme blocks (light `:root`, the `prefers-color-scheme: dark` block and `:root[data-theme="dark"]`) and, if visible on paper, in the `@media print` overrides. Class names are BEM-like (`block__element`, `block--modifier`, `is-state`). Respect `prefers-reduced-motion`.
- **Accessibility:** keep the skip link, labelled buttons, `aria-pressed` on the language switch, focus return when the drawer closes, and visible `:focus-visible` outlines.
- **Print** is a first-class output: a compact, always-light CV without the top bar, timeline, drawer or `.no-print` groups. Any new section needs print styles.

## Writing style

- American English for new English text (`color`, `program`, `behavior`); fix British spellings you come across in the text you touch. Official product and certification names keep their own spelling.
- Plain, direct sentences. Use colons or full stops instead of em dashes. An en dash (`–`) with spaces is only for ranges (`2024 – 2026`, `Mar 2023 – Aug 2024`).
- Sentence case for headings and labels.

## Verifying a change

There are no tests or linters. After a change:

1. Serve the folder (`fetch` fails from `file://`): start the `resume` preview, or run `python -m http.server 8124` and open <http://localhost:8124>.
2. Check the console: no errors and no `[resume]` warnings.
3. Check the affected part in **both EN and PT**, in light and dark themes, and at phone width (below 680px the timeline becomes a list).
4. If the change affects printed content, check print preview.
5. For a JSON-only change, at least confirm the file parses (for example `python -c "import json; json.load(open('data/resume.json', encoding='utf-8'))"`).

When you change the data schema or a behavior described in `README.md`, update the README (and this file) in the same change.

## Commits

Only when the user asks. Match the existing history:

- Imperative, sentence-case subject with no prefix and no trailing period, about 50 characters (`Limit Azure at eNotas to the Tech Lead role`).
- Optional body after a blank line, wrapped at about 76 characters, saying what changed and why.
- One logical change per commit.
