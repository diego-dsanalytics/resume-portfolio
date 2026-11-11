# Diego Scalioni: interactive resume

A resume you explore like a report: a career timeline, a skill filter that cross-filters the page, and a details drawer for each role. It also prints as a plain CV.

It's a static site with no build step and no dependencies, apart from Google Fonts.

## What's in the app

- **Career timeline:** one row per company, newest first, and one bar per role, coloured by career phase. On a phone it becomes a list. The total years of experience above it is calculated from the dates, so it stays current on its own.
- **Skill filter:** pick a skill from the dropdown to highlight the matching roles, work and certifications and dim the rest.
- **Globe and place filter:** a globe under the timeline highlights the countries of the roles and events, and the state where a place has one. Drag it to turn it, or pick a continent, country or state in the list beside it (or a country or marker on the globe), to dim the roles and events from elsewhere. The list is alphabetical at each level. A role's drawer shows a small locator globe and a "Show on globe" button.
- **Details drawer:** opens for any role or certification (except the "Other professional certifications" and "Courses and achievements" groups), with a link you can share, such as `#role-dataside-tech-lead` or `#cert-dp-600`. A certification's drawer shows what it validates, its dates and renewal rule, the skills the exam measures with their weights, and links to the official pages.
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
| `continents` | The top level of the place list: a name and the ISO codes of its `countries`. A country used by a place must be in one |
| `places` | The cities marked on the globe. The list beside it only shows their continent, country and state |
| `experience` | Companies, each with `roles`. `place` is the id of the company's entry in `places` |
| `work` | Featured projects, training and community. Use `date` or a free-text `period`, and `url` or a `links` list. An optional `places` list puts an event on the globe |
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

**Places** look like this:

```json
{ "id": "tres-pontas", "name": "Três Pontas", "country": "BR", "region": { "code": "BR-MG", "name": "Minas Gerais" }, "lat": -21.37, "lon": -45.51 }
```

- `country` is the two-letter ISO code. Its name is translated by the browser, so it isn't in the file.
- `region` is optional and highlights a state. Its `code` needs an outline in [`data/world.json`](data/world.json), which only has Minas Gerais (`BR-MG`), São Paulo (`BR-SP`) and New York (`US-NY`).
- A place with a role is drawn as a filled dot, and a place that only has events as a ring.
- A company's `place` is where the company is, including for remote roles. Never add where you live.

`data/world.json` holds the map outlines, reduced from [Natural Earth](https://www.naturalearthdata.com/) (public domain): the 1:110m countries and three states from the 1:50m states and provinces. The page loads it only when the globe is about to be seen, and without it the globe still shows the place markers.

**To add a certification badge**, put the image in [`assets/badges/`](assets/badges/) and set its `badge` path. `certificationGroups` controls the layout (`badges` or `list`), whether a group starts `collapsed`, whether it appears in `print`, whether its certifications open a drawer (`"drawer": false` turns it off), and the default `validity` text shown in the drawer.

**Certification details** are all optional, and the drawer leaves out whatever is missing:

| Key | What it holds |
| --- | --- |
| `about` | A sentence on what the certification validates |
| `domains` | The exam's skills measured, as `{ "name": ..., "weight": "25–30%" }`, from the official study guide |
| `validity` | Overrides the group's `validity`, such as `"2 years"` for GitHub certifications |
| `url`, `studyGuideUrl` | The official certification page and study guide |
| `credentialUrl` | Your public verification link, such as a Microsoft Learn credential share link or a Credly badge |
| `id` | The shareable link. If it's missing it comes from the `code`, or from the English name |

Only list `domains` for certifications you keep current (Associate certifications renew yearly). A Fundamentals exam can change a lot after you pass it, so its current skills may not be the ones you were tested on.

## Publish on GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In the repository, go to **Settings → Pages** and deploy from `main`, folder `/ (root)`.

A repository named `resume-portfolio` publishes at `https://diego-dsanalytics.github.io/resume-portfolio/`. One named `diego-dsanalytics.github.io` publishes at the shorter root address. All paths are relative, so either works.

## Privacy

This repository and site are public, so anything in `resume.json` can be read by anyone, including scrapers. The phone number and city are deliberately left out, and the original PDF CV isn't stored here for the same reason.
