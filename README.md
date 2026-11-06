# Diego Scalioni: interactive resume

A resume you explore like a report: a career timeline, a skill filter that cross-filters the page, and a details drawer for each role. It also prints as a plain CV.

It's a static site with no build step and no dependencies, apart from Google Fonts.

## What's in the app

- **Career timeline:** one row per company, newest first, and one bar per role, coloured by career phase. On a phone it becomes a list. The total years of experience above it is calculated from the dates, so it stays current on its own.
- **Skill filter:** pick a skill from the dropdown to highlight the matching roles, work and certifications and dim the rest.
- **Details drawer:** opens for any role, with a link you can share, such as `#role-dataside-tech-lead`.
- **Certifications:** a certification's dates update automatically once its `expires` date has passed, showing the period it was valid with no label. Add `"retired": true` to show "Retired by Microsoft" when the issuer withdrew it.
- **Print or save as PDF:** the printer icon gives a compact, light version without the interactive parts.

## Run it locally

The page loads its data with `fetch`, so serve the folder rather than opening `index.html` from disk:

```bash
python -m http.server 8124
```

Then open <http://localhost:8124>.

## Update the content

All content is in [`data/resume.json`](data/resume.json). You shouldn't need to change any code.

**Languages:** any text can be written as `{ "en": "Remote", "pt": "Remoto" }`. A plain value such as `"ETL"` is used in both languages, and a missing `pt` falls back to `en`. Interface wording is under `ui`. The page starts in the visitor's saved choice, otherwise in Portuguese if their browser is set to it, otherwise in English.

| Key | What it holds |
| --- | --- |
| `profile` | Name, title, summary and links. A link's `icon` can be `linkedin`, `github`, `microsoft` or `mail` |
| `phases` | Career phases and their timeline colours |
| `skills` | The list behind the skill filter and the toolkit. `group` sets the toolkit heading |
| `experience` | Companies, each with `roles` |
| `work` | Featured projects, training and community. Use `date` or a free-text `period`, and `url` or a `links` list |
| `education`, `languages` | Shown at the top of the page. A language's `flag` matches a file in `assets/flags/` |
| `certificationGroups`, `certifications` | Certifications and how they're grouped |

**Roles** look like this:

```json
{
  "id": "dataside-tech-lead",
  "title": "Tech Lead DataViz",
  "start": "2023-03",
  "end": "2024-08",
  "phase": "data",
  "mode": "Remote",
  "summary": "One or two sentences about the role.",
  "highlights": ["An achievement", "Another achievement"],
  "skills": ["Power BI", "SQL"]
}
```

- Use `"end": null` for your current role.
- Empty fields are hidden, so you can fill them in gradually.
- `id` becomes the shareable link, so avoid changing it once you've shared one.

**Skills** must match a `name` in `skills` exactly, in English, in every language. A skill's optional `label` is the translated text that's displayed. If a name doesn't match, the browser console logs a warning. The dropdown sorts them alphabetically and leaves out any skill with no roles, certifications or work attached.

**To add a certification badge**, put the image in [`assets/badges/`](assets/badges/) and set its `badge` path. `certificationGroups` controls the layout (`badges` or `list`), whether a group starts `collapsed`, and whether it appears in `print`.

## Publish on GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In the repository, go to **Settings → Pages** and deploy from `main`, folder `/ (root)`.

A repository named `resume-portfolio` publishes at `https://diego-dsanalytics.github.io/resume-portfolio/`. One named `diego-dsanalytics.github.io` publishes at the shorter root address. All paths are relative, so either works.

## Privacy

This repository and site are public, so anything in `resume.json` can be read by anyone, including scrapers. The phone number and city are deliberately left out, and the original PDF CV isn't stored here for the same reason.
