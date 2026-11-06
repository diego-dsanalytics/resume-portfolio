(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(c));
    }
    return node;
  };

  // Browser storage can be missing or throw (private mode, blocked site data).
  const store = {
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    }
  };

  const state = {
    data: null,
    roles: [],            // flat list; each role also carries its company
    skill: "",            // active skill filter; empty shows everything
    now: new Date()
  };

  /* ---------- Dates ---------- */
  const monthIndex = iso => {
    const [y, m] = iso.split("-").map(Number);
    return y * 12 + (m - 1);
  };
  const nowIndex = () => state.now.getFullYear() * 12 + state.now.getMonth();
  const endIndex = role => (role.end ? monthIndex(role.end) : nowIndex());
  // Both ends are inclusive: Jan to Mar is three months.
  const roleMonths = role => endIndex(role) - monthIndex(role.start) + 1;

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtMonth = iso => {
    const [y, m] = iso.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  };
  const fmtRange = role => `${fmtMonth(role.start)} – ${role.end ? fmtMonth(role.end) : "Present"}`;
  const fmtDuration = months => {
    const y = Math.floor(months / 12), m = months % 12;
    return [y && `${y} yr${y > 1 ? "s" : ""}`, m && `${m} mo${m > 1 ? "s" : ""}`].filter(Boolean).join(" ") || "1 mo";
  };
  // Months covered by any of the roles, so overlapping roles are never counted twice.
  const coveredMonths = roles => {
    const months = new Set();
    for (const r of roles) for (let i = monthIndex(r.start); i <= endIndex(r); i++) months.add(i);
    return months.size;
  };
  const isExpired = cert => cert.expires && monthIndex(cert.expires) < nowIndex();

  /* ---------- Theme and print ---------- */
  function initControls() {
    $("#theme-toggle").addEventListener("click", () => {
      const current = document.documentElement.dataset.theme
        || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      store.set("resume-theme", next);
    });
    $("#print-btn").addEventListener("click", () => window.print());
  }

  /* ---------- Hero ---------- */
  function renderHero() {
    const { profile } = state.data;
    document.title = `${profile.name} | ${profile.title}`;
    $("#hero-name").textContent = profile.name;
    $("#hero-title").textContent = [profile.title, profile.credentials, profile.location].filter(Boolean).join(" · ");
    $("#hero-summary").textContent = profile.summary;
    $("#hero-links").replaceChildren(...profile.links.map(l =>
      el("li", {}, el("a", { href: l.url, ...externalAttrs(l.url) },
        linkIcon(l.icon),
        el("span", { class: "hero__link-label" }, l.label),
        el("span", { class: "hero__link-display" }, l.display)))));
  }

  const externalAttrs = url => (url.startsWith("http") ? { target: "_blank", rel: "noopener" } : {});

  const ICONS = {
    linkedin: { box: "0 0 24 24", d: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" },
    github: { box: "0 0 16 16", d: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" },
    microsoft: { box: "0 0 24 24", d: "M1 1h10.5v10.5H1zM12.5 1H23v10.5H12.5zM1 12.5h10.5V23H1zM12.5 12.5H23V23H12.5z" },
    mail: { box: "0 0 24 24", d: "M2 4h20a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1.6 2L12 12.7 20.4 6H3.6zM21 7.6l-8.4 6.7a1 1 0 0 1-1.2 0L3 7.6V18h18V7.6z" }
  };

  function linkIcon(name) {
    const icon = ICONS[name];
    if (!icon) return null;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", icon.box);
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", icon.d);
    svg.append(path);
    return svg;
  }

  function renderYears() {
    const years = Math.floor(coveredMonths(state.roles) / 12);
    $("#career-years").replaceChildren(el("strong", {}, `${years}+`), " years of experience");
  }

  /* ---------- Skill filter ---------- */
  const usage = name => ({
    roles: state.roles.filter(r => r.skills.includes(name)).length,
    certs: state.data.certifications.filter(c => c.skills.includes(name)).length,
    work: state.data.work.filter(w => w.skills.includes(name)).length
  });

  function renderSkillFilter() {
    // A skill with nothing behind it would filter to an empty page, so it isn't offered.
    const skills = state.data.skills
      .map(s => s.name)
      .filter(name => { const u = usage(name); return u.roles + u.certs + u.work > 0; })
      .sort((a, b) => a.localeCompare(b));
    const select = $("#skill-filter");
    select.replaceChildren(
      el("option", { value: "" }, "All skills"),
      ...skills.map(name => el("option", { value: name }, name)));
    select.addEventListener("change", () => setSkill(select.value));
  }

  function setSkill(name) {
    state.skill = name;
    $("#skill-filter").value = name;
    applyFilter();
  }

  function applyFilter() {
    const skill = state.skill;
    const matches = skills => !skill || skills.includes(skill);

    let matchedRoles = 0;
    for (const role of state.roles) {
      const hit = matches(role.skills);
      if (hit) matchedRoles++;
      $$(`[data-role="${role.id}"]`).forEach(n => n.classList.toggle("is-dim", !hit));
    }
    $$("[data-skills]").forEach(n => n.classList.toggle("is-dim", !matches(JSON.parse(n.dataset.skills))));

    // A match hidden inside the collapsed list should not stay out of sight.
    const collapsed = $("#cert-list details");
    if (collapsed && skill && $$("[data-skills]:not(.is-dim)", collapsed).length) collapsed.open = true;

    const matchedCerts = state.data.certifications.filter(c => matches(c.skills)).length;
    $("#filter-status").textContent = skill
      ? `${plural(matchedRoles, "role")} and ${plural(matchedCerts, "certification")}`
      : "";
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  /* ---------- Timeline ---------- */
  function renderTimeline() {
    const { data, roles } = state;
    const start = Math.min(...roles.map(r => monthIndex(r.start)));
    const first = Math.floor(start / 12);                     // first January on the axis
    const last = Math.floor(nowIndex() / 12);
    const span = (last + 1 - first) * 12;
    const pct = months => `${((months - first * 12) / span) * 100}%`;

    const years = [];
    for (let y = first; y <= last; y++) years.push(y);

    const axis = el("div", { class: "timeline__axis", "aria-hidden": "true" },
      years.map(y => el("span", { style: `left:${pct(y * 12)}` }, String(y))));

    // Same order as the data: the most recent company is the top row.
    const rows = data.experience.map(company =>
      el("div", { class: "timeline__row" },
        el("div", { class: "timeline__company" }, company.company),
        el("div", { class: "timeline__track" },
          company.roles.map(role => {
            const flat = roles.find(r => r.id === role.id);
            return el("button", {
              type: "button",
              class: `bar bar--${role.phase}${role.end ? "" : " bar--current"}`,
              "data-role": role.id,
              style: `--left:${pct(monthIndex(role.start))};--width:${(roleMonths(flat) / span) * 100}%`,
              "aria-label": `${role.title} at ${company.company}, ${fmtRange(role)}. Open details.`,
              onclick: () => { location.hash = `role-${role.id}`; },
              onmouseenter: () => showReadout(flat),
              onfocus: () => showReadout(flat)
            },
              el("span", { class: "bar__title" }, role.title),
              el("span", { class: "bar__dates" }, fmtRange(role)));
          }))));

    $("#timeline").replaceChildren(axis, ...rows);
    showReadout(null);

    const used = new Set(roles.map(r => r.phase));
    $("#legend").replaceChildren(...data.phases.filter(p => used.has(p.id)).map(p =>
      el("li", {}, el("span", { class: `swatch bar--${p.id}` }), p.name)));
  }

  function showReadout(role) {
    $("#readout").textContent = role
      ? `${role.title} · ${role.company} · ${fmtRange(role)} · ${fmtDuration(roleMonths(role))}`
      : "Hover or focus a bar to preview a role.";
  }

  /* ---------- Experience ---------- */
  function renderExperience() {
    $("#experience-list").replaceChildren(...state.data.experience.map(company =>
      el("article", { class: "company" },
        el("div", { class: "company__head" },
          el("h3", {}, company.company),
          company.location && el("p", { class: "muted" }, company.location)),
        el("ol", { class: "company__roles" }, company.roles.map(role => {
          const flat = state.roles.find(r => r.id === role.id);
          return el("li", { class: "role", "data-role": role.id },
            el("a", { class: "role__title", href: `#role-${role.id}` }, role.title),
            el("p", { class: "role__dates" }, `${fmtRange(role)} · ${fmtDuration(roleMonths(flat))}`),
            role.summary && el("p", { class: "role__summary" }, role.summary),
            highlightList(role.highlights));
        })))));
  }

  const highlightList = items => (items && items.length
    ? el("ul", { class: "highlights" }, items.map(h => el("li", {}, h)))
    : null);

  /* ---------- Selected work ---------- */
  function renderWork() {
    const items = state.data.work;
    $("#work").hidden = !items.length;
    $("#work-list").replaceChildren(...items.map(w =>
      el("article", { class: "work__item", "data-skills": JSON.stringify(w.skills) },
        el("p", { class: "work__meta" }, `${w.kind} · ${fmtMonth(w.date)}`),
        el("h3", {}, w.title),
        el("p", {}, w.summary),
        chipList(w.skills),
        w.url && el("a", { class: "work__link", href: w.url, ...externalAttrs(w.url) }, w.linkLabel || "Read more"))));
  }

  const chipList = skills => (skills && skills.length
    ? el("ul", { class: "chips" }, skills.map(s => el("li", {}, s)))
    : null);

  /* ---------- Certifications ---------- */
  function certStatus(cert) {
    // Only a retirement gets a label. A lapsed certification just shows its validity dates.
    return cert.retired ? el("span", { class: "tag" }, `Retired by ${cert.issuer}`) : null;
  }

  function badgeCard(cert) {
    return el("li", { class: "badge-card", "data-skills": JSON.stringify(cert.skills) },
      cert.badge && el("img", { src: cert.badge, alt: "", width: "72", height: "72", loading: "lazy", decoding: "async" }),
      el("div", {},
        el("p", { class: "badge-card__code" }, cert.code, certStatus(cert)),
        el("p", { class: "badge-card__name" }, cert.name),
        el("p", { class: "badge-card__date" }, certDate(cert))));
  }

  const certDate = cert => {
    const issued = cert.issued ? fmtMonth(cert.issued) : "";
    if (!cert.expires) return issued;
    if (isExpired(cert)) return issued ? `${issued} – ${fmtMonth(cert.expires)}` : `Until ${fmtMonth(cert.expires)}`;
    return issued ? `${issued} · valid until ${fmtMonth(cert.expires)}` : `Valid until ${fmtMonth(cert.expires)}`;
  };

  function certRow(cert) {
    return el("li", { class: "cert-row", "data-skills": JSON.stringify(cert.skills) },
      el("span", { class: "cert-row__name" }, cert.name, certStatus(cert)),
      el("span", { class: "cert-row__meta" }, `${cert.issuer} · ${certDate(cert)}`));
  }

  function renderCertifications() {
    const { certificationGroups, certifications } = state.data;
    const blocks = certificationGroups.map(group => {
      const certs = certifications.filter(c => c.group === group.id);
      if (!certs.length) return null;
      const list = group.style === "badges"
        ? el("ul", { class: "badges" }, certs.map(badgeCard))
        : el("ul", { class: "cert-rows" }, certs.map(certRow));
      const cls = `cert-group${group.print ? "" : " no-print"}`;
      if (group.collapsed) {
        return el("details", { class: cls },
          el("summary", {}, `${group.name} (${certs.length})`), list);
      }
      return el("div", { class: cls }, el("h3", {}, group.name), list);
    });
    $("#cert-list").replaceChildren(...blocks.filter(Boolean));
  }

  /* ---------- Background ---------- */
  function renderBackground() {
    const { education, languages, skills } = state.data;
    $("#education-list").replaceChildren(...education.map(e =>
      el("div", { class: "edu" },
        el("p", { class: "edu__degree" }, e.degree),
        e.level && el("p", { class: "muted" }, e.level),
        el("p", { class: "muted" }, e.school),
        el("p", { class: "edu__dates" }, `${e.start} – ${e.end}`))));

    const groups = [...new Set(skills.map(s => s.group))];
    $("#toolkit-list").replaceChildren(...groups.map(g =>
      el("div", { class: "toolkit" },
        el("p", { class: "toolkit__group" }, g),
        el("ul", { class: "chips" }, skills.filter(s => s.group === g).map(s => {
          const u = usage(s.name);
          return el("li", { title: `${plural(u.roles, "role")}, ${plural(u.certs, "certification")}, ${plural(u.work, "work item")}` }, s.name);
        })))));

    $("#language-list").replaceChildren(...languages.map(l =>
      el("div", {}, el("dt", {}, l.name), l.level && el("dd", {}, l.level))));
  }

  /* ---------- Drawer ---------- */
  function openRole(id) {
    const role = state.roles.find(r => r.id === id);
    if (!role) { console.warn(`[resume] No role with id "${id}"`); return; }
    const siblings = state.roles.filter(r => r.company === role.company && r.id !== id);
    const companyLine = [role.company, role.location, role.mode].filter(Boolean).join(" · ");

    $("#drawer-body").replaceChildren(...[
      el("p", { class: `drawer__phase phase--${role.phase}` }, phaseName(role.phase)),
      el("h2", { id: "drawer-title" }, role.title),
      el("p", { class: "drawer__company" }, companyLine),
      el("p", { class: "drawer__dates" }, `${fmtRange(role)} · ${fmtDuration(roleMonths(role))}`),
      role.summary && el("p", {}, role.summary),
      highlightList(role.highlights),
      role.skills.length ? el("h3", {}, "Skills") : null,
      role.skills.length ? el("div", { class: "drawer__skills" }, role.skills.map(s =>
        el("button", {
          type: "button", class: "skill-btn",
          onclick: () => { setSkill(s); closeDrawer(); location.hash = "career"; }
        }, s))) : null,
      siblings.length ? el("h3", {}, `Also at ${role.company}`) : null,
      siblings.length ? el("ul", { class: "drawer__siblings" }, siblings.map(r =>
        el("li", {}, el("a", { href: `#role-${r.id}` }, r.title), ` · ${fmtRange(r)}`))) : null
    ].filter(Boolean));

    const drawer = $("#drawer");
    if (!drawer.open) drawer.showModal();
    $("#drawer-close").focus();
  }

  const phaseName = id => (state.data.phases.find(p => p.id === id) || { name: "" }).name;

  // The browser queues the dialog's close event, so the hash is cleared right away as
  // well. Otherwise selecting the same role again would not change the hash or reopen it.
  function clearRoleHash() {
    if (location.hash.startsWith("#role-")) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  function closeDrawer() {
    const drawer = $("#drawer");
    clearRoleHash();
    if (drawer.open) drawer.close();
  }

  function initDrawer() {
    const drawer = $("#drawer");
    $("#drawer-close").addEventListener("click", closeDrawer);
    // A click on the backdrop lands on the dialog element itself.
    drawer.addEventListener("click", e => { if (e.target === drawer) closeDrawer(); });
    drawer.addEventListener("cancel", clearRoleHash); // Esc
    drawer.addEventListener("close", () => {
      clearRoleHash();
      const trigger = state.lastTrigger;
      if (trigger && trigger.isConnected) trigger.focus();
    });
    // The browser only restores focus to what opened the dialog, and a hash change
    // loses that, so remember the control that was used.
    document.addEventListener("click", e => {
      const t = e.target.closest("button[data-role], a[href^='#role-']");
      if (t && !drawer.contains(t)) state.lastTrigger = t;
    });
  }

  function syncHash() {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash.startsWith("role-")) openRole(hash.slice(5));
    else closeDrawer();
  }

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const targets = $$(".section__head, .timeline, .company, .work__item, .cert-group, .toolkit");
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -6% 0px" });
    targets.forEach(t => { t.classList.add("reveal"); io.observe(t); });
  }

  /* ---------- Data checks ---------- */
  function validate() {
    const { data, roles } = state;
    const known = new Set(data.skills.map(s => s.name));
    const phases = new Set(data.phases.map(p => p.id));
    const groups = new Set(data.certificationGroups.map(g => g.id));
    const check = (owner, skills) => skills.forEach(s => {
      if (!known.has(s)) console.warn(`[resume] "${owner}" names an unknown skill: "${s}". Add it to "skills".`);
    });
    roles.forEach(r => {
      check(r.id, r.skills);
      if (!phases.has(r.phase)) console.warn(`[resume] "${r.id}" has an unknown phase: "${r.phase}".`);
    });
    data.work.forEach(w => check(w.title, w.skills));
    data.certifications.forEach(c => {
      check(c.name, c.skills);
      if (!groups.has(c.group)) console.warn(`[resume] "${c.name}" has an unknown group: "${c.group}".`);
    });
    const ids = roles.map(r => r.id);
    ids.filter((id, i) => ids.indexOf(id) !== i).forEach(id => console.warn(`[resume] Duplicate role id: "${id}".`));
  }

  /* ---------- Boot ---------- */
  async function init() {
    initControls();
    initDrawer();
    try {
      const res = await fetch("data/resume.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
    } catch (err) {
      console.error("[resume] Could not load data/resume.json", err);
      $("#main").replaceChildren(el("p", { class: "wrap load-error" },
        "The resume data could not be loaded. If you opened this file directly from disk, serve the folder instead (see the README)."));
      return;
    }

    state.roles = state.data.experience.flatMap(c => c.roles.map(r => ({
      ...r, company: c.company, location: c.location
    })));

    validate();
    renderHero();
    renderYears();
    renderSkillFilter();
    renderTimeline();
    renderExperience();
    renderWork();
    renderCertifications();
    renderBackground();
    initReveal();

    window.addEventListener("hashchange", syncHash);
    syncHash();
  }

  init();
})();
