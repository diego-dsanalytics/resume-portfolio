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
    get(key) {
      try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    }
  };

  const LOCALES = { en: "en", pt: "pt-BR" };

  const state = {
    raw: null,            // resume.json as loaded, with both languages
    data: null,           // the same data resolved to the current language
    lang: "en",
    roles: [],            // flat list; each role also carries its company
    skill: "",            // active skill filter; empty shows everything
    place: "",            // active place filter: a country code, a place id or empty
    geo: null,            // map outlines from world.json, loaded when the globe is needed
    now: new Date()
  };

  /* ---------- Language ---------- */
  const isTranslation = v => v && typeof v === "object" && !Array.isArray(v) && "en" in v;

  // Replaces every { "en": ..., "pt": ... } in the data with the text for one language.
  // A plain value is the same in both languages, and a missing "pt" falls back to "en".
  function localize(value, lang) {
    if (isTranslation(value)) return value[lang] ?? value.en;
    if (Array.isArray(value)) return value.map(v => localize(v, lang));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, localize(v, lang)]));
    }
    return value;
  }

  // "Implement a lakehouse in Microsoft Fabric" -> "implement-a-lakehouse-in-microsoft-fabric"
  const slug = text => text.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const t = (key, vars = {}) => Object.entries(vars).reduce(
    (text, [k, v]) => text.replace(`{${k}}`, v), state.data.ui[key] ?? key);

  function initialLanguage() {
    const saved = store.get("resume-lang");
    if (saved && LOCALES[saved]) return saved;
    return (navigator.language || "").toLowerCase().startsWith("pt") ? "pt" : "en";
  }

  function renderStaticText() {
    document.documentElement.lang = LOCALES[state.lang];
    $$("[data-i18n]").forEach(n => { n.textContent = t(n.dataset.i18n); });
    $$("[data-i18n-label]").forEach(n => {
      const text = t(n.dataset.i18nLabel);
      n.setAttribute("aria-label", text);
      if (n.hasAttribute("title")) n.title = text;
    });
    $$("[data-lang]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang)));
  }

  function setLanguage(lang) {
    if (lang === state.lang) return;
    state.lang = lang;
    store.set("resume-lang", lang);
    render();
  }

  /* ---------- Dates ---------- */
  const monthIndex = iso => {
    const [y, m] = iso.split("-").map(Number);
    return y * 12 + (m - 1);
  };
  const nowIndex = () => state.now.getFullYear() * 12 + state.now.getMonth();
  const endIndex = role => (role.end ? monthIndex(role.end) : nowIndex());
  // Both ends are inclusive: Jan to Mar is three months.
  const roleMonths = role => endIndex(role) - monthIndex(role.start) + 1;

  const fmtMonth = iso => {
    const [y, m] = iso.split("-").map(Number);
    return `${state.data.ui.months[m - 1]} ${y}`;
  };
  const fmtRange = role => `${fmtMonth(role.start)} – ${role.end ? fmtMonth(role.end) : t("present")}`;
  const plural = (n, key) => `${n} ${state.data.ui[key][n === 1 ? 0 : 1]}`;
  const fmtDuration = months => {
    const y = Math.floor(months / 12), m = months % 12;
    return [y && plural(y, "year"), m && plural(m, "month")].filter(Boolean).join(" ");
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
      redrawGlobes();
    });
    $("#print-btn").addEventListener("click", () => window.print());
    $$("[data-lang]").forEach(b => b.addEventListener("click", () => setLanguage(b.dataset.lang)));
    const select = $("#skill-filter");
    select.addEventListener("change", () => setSkill(select.value));
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
    $("#career-years").replaceChildren(el("strong", {}, `${years}+`), ` ${t("yearsOf")}`);
  }

  /* ---------- Skill filter ---------- */
  // Skills are matched by "name" in every language; "label" is only what gets displayed.
  const skillLabel = name => {
    const skill = state.data.skills.find(s => s.name === name);
    return (skill && skill.label) || name;
  };

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
      .sort((a, b) => skillLabel(a).localeCompare(skillLabel(b), LOCALES[state.lang]));
    const select = $("#skill-filter");
    select.replaceChildren(
      el("option", { value: "" }, t("allSkills")),
      ...skills.map(name => el("option", { value: name }, skillLabel(name))));
    select.value = state.skill;
  }

  function setSkill(name) {
    state.skill = name;
    $("#skill-filter").value = name;
    applyFilter();
  }

  function applyFilter() {
    const { skill, place } = state;
    const matches = skills => !skill || skills.includes(skill);
    const here = places => !place || places.some(id => inPlace(id, place));

    let matchedRoles = 0;
    for (const role of state.roles) {
      const hit = matches(role.skills) && here([role.place]);
      if (hit) matchedRoles++;
      $$(`[data-role="${role.id}"]`).forEach(n => n.classList.toggle("is-dim", !hit));
    }
    // Only items that carry places (featured work) react to the place filter.
    $$("[data-skills]").forEach(n => {
      const placed = !n.dataset.places || here(JSON.parse(n.dataset.places));
      n.classList.toggle("is-dim", !(matches(JSON.parse(n.dataset.skills)) && placed));
    });

    // A match hidden inside the collapsed list should not stay out of sight.
    const collapsed = $("#cert-list details");
    if (collapsed && skill && $$("[data-skills]:not(.is-dim)", collapsed).length) collapsed.open = true;

    const matchedCerts = state.data.certifications.filter(c => matches(c.skills)).length;
    const events = place ? placeCounts(place).events : 0;
    // An event-only place says "1 event", not "0 roles and 1 event".
    const counts = matchedRoles || skill || !events ? [plural(matchedRoles, "role")] : [];
    if (skill) counts.push(plural(matchedCerts, "certification"));
    else if (events) counts.push(plural(events, "event"));
    $("#filter-status").textContent = skill || place
      ? `${place ? `${placeLabel(place)}: ` : ""}${counts.join(` ${t("and")} `)}`
      : "";
  }

  /* ---------- Places ---------- */
  // The place filter holds a continent id ("europe"), a country code ("BR") or a region
  // code ("BR-MG"). The globe also previews single places by their id ("tres-pontas").
  const placeById = id => state.data.places.find(p => p.id === id);
  const continentById = id => state.data.continents.find(c => c.id === id);
  const continentOf = code => state.data.continents.find(c => c.countries.includes(code)) || {};
  const regionCode = place => (place.region ? place.region.code : "");
  const placeLevel = selection => (continentById(selection) ? "continent"
    : placeById(selection) ? "place"
    : state.data.places.some(p => p.country === selection) ? "country" : "region");
  const placesIn = selection => state.data.places.filter(p => p.id === selection || p.country === selection
    || regionCode(p) === selection || continentOf(p.country).id === selection);
  const inPlace = (id, selection) => placesIn(selection).some(p => p.id === id);
  const countryName = code => {
    try { return new Intl.DisplayNames([LOCALES[state.lang]], { type: "region" }).of(code); } catch { return code; }
  };
  const placeLabel = selection => {
    const region = state.data.places.map(p => p.region).find(r => r && r.code === selection);
    return (continentById(selection) || region || { name: countryName(selection) }).name;
  };
  const placeCounts = selection => ({
    roles: state.roles.filter(r => inPlace(r.place, selection)).length,
    events: state.data.work.reduce((n, w) => n + (w.places || []).filter(id => inPlace(id, selection)).length, 0)
  });
  // A place is an event place when no role happened there.
  const isWorkPlace = id => state.roles.some(r => r.place === id);

  function renderPlaces() {
    const { places } = state.data;
    const button = (id, label, cls = "") => {
      const { roles, events } = id ? placeCounts(id) : {};
      const counts = [roles && plural(roles, "role"), events && plural(events, "event")].filter(Boolean).join(" · ");
      return el("button", {
        type: "button", class: `place-btn ${cls}`.trim(), "data-place": id,
        "aria-pressed": String(state.place === id),
        onclick: () => setPlace(state.place === id ? "" : id)
      }, el("span", {}, label), counts && el("span", { class: "place-btn__count" }, counts));
    };
    // Continent, then country, then state: each level in alphabetical order.
    const sorted = nodes => nodes.sort((a, b) => a.label.localeCompare(b.label, LOCALES[state.lang]));
    const regions = code => [...new Map(places.filter(p => p.country === code && p.region)
      .map(p => [p.region.code, { id: p.region.code, label: p.region.name }])).values()];
    const tree = sorted(state.data.continents.map(c => ({
      id: c.id, label: c.name,
      children: sorted(c.countries.filter(code => places.some(p => p.country === code))
        .map(code => ({ id: code, label: countryName(code), children: sorted(regions(code)) })))
    })));
    const levels = ["continent", "country", "region"];
    const branch = (nodes, depth) => (nodes && nodes.length
      ? el("ul", { class: `place-tree place-tree--${levels[depth]}` }, nodes.map(n =>
        el("li", {}, button(n.id, n.label, `place-btn--${levels[depth]}`), branch(n.children, depth + 1))))
      : null);
    $("#place-list").replaceChildren(button("", t("allPlaces"), "place-btn--all"), branch(tree, 0));
    $("#place-legend").replaceChildren(
      el("li", {}, el("span", { class: "place-dot" }), t("placeWork")),
      el("li", {}, el("span", { class: "place-dot place-dot--event" }), t("placeEvents")));
    redrawGlobes();
  }

  function setPlace(selection) {
    state.place = selection;
    $$("#place-list [data-place]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.place === selection)));
    if (mainGlobe) mainGlobe.select(selection);
    applyFilter();
  }

  /* ---------- Globe ---------- */
  const RAD = Math.PI / 180;
  const HOME = { lon: -32, lat: 24, k: 1 };   // the Atlantic: every place is in view
  const globes = new Set();
  let mainGlobe = null;
  let geoRequest = null;

  const unit = (lon, lat) => {
    const c = Math.cos(lat * RAD);
    return [c * Math.cos(lon * RAD), c * Math.sin(lon * RAD), Math.sin(lat * RAD)];
  };
  // A ring is a flat [lon, lat, lon, lat, ...] list. On the sphere it becomes [x, y, z, ...].
  const toVectors = ring => {
    const out = new Float32Array((ring.length / 2) * 3);
    for (let i = 0, j = 0; i < ring.length; i += 2, j += 3) out.set(unit(ring[i], ring[i + 1]), j);
    return out;
  };
  const line = (from, to, step, point) => {
    const ring = [];
    for (let v = from; v <= to; v += step) ring.push(...point(v));
    return toVectors(ring);
  };
  const GRATICULE = [
    ...[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180].map(lon => line(-80, 80, 5, lat => [lon, lat])),
    ...[-60, -30, 0, 30, 60].map(lat => line(-180, 180, 5, lon => [lon, lat]))
  ];

  function pointInRings(lon, lat, rings) {
    let inside = false;
    for (const r of rings) {
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        if ((r[i + 1] > lat) !== (r[j + 1] > lat)
          && lon < ((r[j] - r[i]) * (lat - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) inside = !inside;
      }
    }
    return inside;
  }

  // The outlines are only fetched when a globe is about to be seen.
  function loadGeo() {
    geoRequest ??= fetch("data/world.json")
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(raw => {
        const shapes = group => Object.fromEntries(Object.entries(group || {}).map(
          ([id, rings]) => [id, { rings, vectors: rings.map(toVectors) }]));
        state.geo = { countries: shapes(raw.countries), regions: shapes(raw.regions) };
        for (const p of state.data.places) {
          if (!state.geo.countries[p.country]) console.warn(`[resume] Place "${p.id}" has a country with no outline: "${p.country}".`);
          if (p.region && !state.geo.regions[p.region.code]) console.warn(`[resume] Place "${p.id}" has a region with no outline: "${p.region.code}".`);
        }
        redrawGlobes();
      })
      .catch(err => console.warn("[resume] Could not load data/world.json, so the globe has no map.", err));
    return geoRequest;
  }

  function redrawGlobes() {
    for (const globe of globes) {
      if (globe.canvas.isConnected) globe.draw();
      else globes.delete(globe);
    }
  }

  // An orthographic globe on a canvas. The page has one that can be dragged and clicked,
  // and the drawer gets a small fixed one for each role.
  function createGlobe(canvas, { interactive = false, onPick } = {}) {
    const ctx = canvas.getContext("2d");
    const view = { ...HOME };
    let selection = "";   // what the place filter holds
    let focus = "";       // a place being previewed, which wins over the selection
    let size = 0;         // canvas width in CSS pixels
    let frame = 0;
    let onScreen = !interactive;
    let scratch = new Float32Array(1024);

    const ZOOM = { continent: 1.4, country: 1.6, region: 3.5, place: 4 };
    const target = (id, zoom) => {
      const inside = id ? placesIn(id) : [];
      if (!inside.length) return { ...HOME };
      const mean = key => inside.reduce((sum, p) => sum + p[key], 0) / inside.length;
      return { lon: mean("lon"), lat: mean("lat"), k: zoom || ZOOM[placeLevel(id)] };
    };

    // Screen axes for the current view: east, north and toward the viewer.
    function camera() {
      const lo = view.lon * RAD, la = view.lat * RAD;
      return {
        c: size / 2, s: (size / 2 - 1) * view.k,
        e: [-Math.sin(lo), Math.cos(lo), 0],
        n: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)],
        f: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
      };
    }
    const dot = (a, v, i) => a[0] * v[i] + a[1] * v[i + 1] + a[2] * v[i + 2];

    // Adds one outline to the current path. Points on the far side are moved to the edge
    // of the disc for a closed shape, and break the line for an open one.
    function trace(cam, vectors, closed) {
      const count = vectors.length / 3;
      if (scratch.length < count * 2) scratch = new Float32Array(count * 2);
      let visible = false;
      for (let i = 0; i < count; i++) {
        let x = dot(cam.e, vectors, i * 3), y = dot(cam.n, vectors, i * 3);
        if (dot(cam.f, vectors, i * 3) < 0) {
          if (closed) { const d = Math.hypot(x, y) || 1; x /= d; y /= d; } else x = NaN;
        } else visible = true;
        scratch[i * 2] = cam.c + cam.s * x;
        scratch[i * 2 + 1] = cam.c - cam.s * y;
      }
      if (!visible) return;
      let pen = false;
      for (let i = 0; i < count; i++) {
        const x = scratch[i * 2], y = scratch[i * 2 + 1];
        if (Number.isNaN(x)) { pen = false; continue; }
        if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        pen = true;
      }
      if (closed) ctx.closePath();
    }

    function markers(cam) {
      return state.data.places.map(place => {
        const v = unit(place.lon, place.lat);
        return dot(cam.f, v, 0) > 0.05
          ? { place, x: cam.c + cam.s * dot(cam.e, v, 0), y: cam.c - cam.s * dot(cam.n, v, 0) }
          : null;
      }).filter(Boolean);
    }

    function draw() {
      if (!size || !state.data) return;
      const css = getComputedStyle(canvas);
      const color = name => css.getPropertyValue(name).trim();
      const dpr = window.devicePixelRatio || 1;
      const cam = camera();
      const radius = size / 2 - 1;
      const hot = focus || selection;
      const hotPlace = placeById(hot);
      const hotCountries = new Set((hot ? placesIn(hot) : []).map(p => p.country));
      const hotRegion = hotPlace ? regionCode(hotPlace) : hot;
      const visited = new Set(state.data.places.map(p => p.country));
      const { geo } = state;

      const paint = (shapes, fill, alpha = 1) => {
        ctx.beginPath();
        for (const shape of shapes) for (const vectors of shape.vectors) trace(cam, vectors, true);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cam.c, cam.c, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = color("--globe-sea");
      ctx.fillRect(0, 0, size, size);

      ctx.lineJoin = "round";
      ctx.strokeStyle = color("--globe-line");
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (const vectors of GRATICULE) trace(cam, vectors, false);
      ctx.stroke();

      if (geo) {
        const ids = Object.keys(geo.countries);
        ctx.lineWidth = 0.6;
        paint(ids.filter(id => !visited.has(id)).map(id => geo.countries[id]), color("--globe-land"));
        paint(ids.filter(id => visited.has(id)).map(id => geo.countries[id]), color("--globe-visited"));
        // With a region to show, the country around it is only tinted.
        const region = hotRegion && geo.regions[hotRegion];
        paint(ids.filter(id => hotCountries.has(id)).map(id => geo.countries[id]), color("--globe-active"), region ? 0.35 : 1);
        if (region) paint([region], color("--globe-active"));
      }

      for (const { place, x, y } of markers(cam)) {
        const work = isWorkPlace(place.id);
        ctx.beginPath();
        ctx.arc(x, y, place.id === hot ? 5.5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = color(work ? "--globe-marker" : "--globe-halo");
        ctx.strokeStyle = color(work ? "--globe-halo" : "--globe-marker");
        ctx.lineWidth = work ? 1.5 : 2;
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cam.c, cam.c, radius, 0, Math.PI * 2);
      ctx.strokeStyle = color("--globe-line");
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    function fly(to, ms = 900) {
      cancelAnimationFrame(frame);
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (still || !onScreen || !size) { Object.assign(view, to); draw(); return; }
      const from = { ...view };
      const turn = ((to.lon - from.lon + 540) % 360) - 180;   // the short way around
      let start = 0;
      const step = now => {
        start ||= now;
        const p = Math.min(1, (now - start) / ms);
        const q = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
        view.lon = from.lon + turn * q;
        view.lat = from.lat + (to.lat - from.lat) * q;
        view.k = from.k + (to.k - from.k) * q;
        draw();
        if (p < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }

    new ResizeObserver(() => {
      const next = Math.round(canvas.clientWidth);
      if (!next || next === size) return;
      size = next;
      canvas.width = canvas.height = Math.round(size * (window.devicePixelRatio || 1));
      draw();
    }).observe(canvas);

    if (interactive) {
      let drag = null;
      const pick = e => {
        const box = canvas.getBoundingClientRect();
        const x = e.clientX - box.left, y = e.clientY - box.top;
        const cam = camera();
        const near = markers(cam)
          .map(m => ({ id: regionCode(m.place) || m.place.country, d: Math.hypot(m.x - x, m.y - y) }))
          .filter(m => m.d < 14).sort((a, b) => a.d - b.d)[0];
        if (near) { onPick(near.id); return; }
        // Back from the screen to a longitude and latitude, then to the country under it.
        const px = (x - cam.c) / cam.s, py = (cam.c - y) / cam.s;
        const pz = Math.sqrt(1 - px * px - py * py);
        if (Number.isNaN(pz) || !state.geo) return;
        const v = [0, 1, 2].map(i => px * cam.e[i] + py * cam.n[i] + pz * cam.f[i]);
        const lon = Math.atan2(v[1], v[0]) / RAD, lat = Math.asin(v[2]) / RAD;
        const code = [...new Set(state.data.places.map(p => p.country))].find(id =>
          state.geo.countries[id] && pointInRings(lon, lat, state.geo.countries[id].rings));
        if (code) onPick(code);
      };
      canvas.addEventListener("pointerdown", e => {
        cancelAnimationFrame(frame);
        drag = { x: e.clientX, y: e.clientY, lon: view.lon, lat: view.lat, moved: false };
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener("pointermove", e => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        canvas.classList.add("is-dragging");
        const s = (size / 2 - 1) * view.k * RAD;
        view.lon = ((drag.lon - dx / s + 540) % 360) - 180;
        view.lat = Math.max(-85, Math.min(85, drag.lat + dy / s));
        draw();
      });
      const release = e => {
        if (drag && !drag.moved && e.type === "pointerup") pick(e);
        drag = null;
        canvas.classList.remove("is-dragging");
      };
      canvas.addEventListener("pointerup", release);
      canvas.addEventListener("pointercancel", release);

      // The first time it scrolls into view, the globe turns into place.
      let arrived = false;
      new IntersectionObserver(entries => {
        onScreen = entries[0].isIntersecting;
        if (!onScreen || arrived) return;
        arrived = true;
        if (!selection && !focus) { view.lon = HOME.lon + 70; fly(HOME, 1400); }
      }, { threshold: 0.35 }).observe(canvas);
    }

    const globe = {
      canvas, draw,
      select(id) { selection = id; focus = ""; fly(target(id)); },
      peek(id) { if (placeById(id)) { focus = id; fly(target(id, 2)); } },
      show(id, zoom) { selection = id; Object.assign(view, target(id, zoom)); draw(); }
    };
    globes.add(globe);
    return globe;
  }

  function initGlobe() {
    const canvas = $("#globe");
    mainGlobe = createGlobe(canvas, {
      interactive: true,
      onPick: id => setPlace(state.place === id ? "" : id)
    });
    // Leaving a previewed role returns the globe to the selected place.
    const settle = () => mainGlobe.select(state.place);
    $("#timeline").addEventListener("mouseleave", settle);
    $("#drawer").addEventListener("close", settle);
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redrawGlobes);
    if (!("IntersectionObserver" in window)) { loadGeo(); return; }
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect();
      loadGeo();
    }, { rootMargin: "400px" });
    io.observe(canvas);
  }

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
              "aria-label": t("barLabel", { title: role.title, company: company.company, dates: fmtRange(role) }),
              onclick: () => { location.hash = `role-${role.id}`; },
              onmouseenter: () => previewRole(flat),
              onfocus: () => previewRole(flat)
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

  function previewRole(role) {
    showReadout(role);
    if (mainGlobe) mainGlobe.peek(role.place);
  }

  function showReadout(role) {
    $("#readout").textContent = role
      ? `${role.title} · ${role.company} · ${fmtRange(role)} · ${fmtDuration(roleMonths(role))}`
      : t("readoutHint");
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

  /* ---------- Featured work ---------- */
  function renderWork() {
    const items = state.data.work;
    $("#work").hidden = !items.length;
    $("#work-list").replaceChildren(...items.map(w => {
      // One "url", or a "links" list when an item has several.
      const links = w.links || (w.url ? [{ url: w.url, label: w.linkLabel || t("readMore") }] : []);
      return el("article", { class: "work__item", "data-skills": JSON.stringify(w.skills), "data-places": JSON.stringify(w.places || []) },
        el("p", { class: "work__meta" }, `${w.kind} · ${w.period || fmtMonth(w.date)}`),
        el("h3", {}, w.title),
        el("p", {}, w.summary),
        chipList(w.skills),
        links.length ? el("div", { class: "work__links" }, links.map(l =>
          el("a", { href: l.url, ...externalAttrs(l.url) }, l.label))) : null);
    }));
  }

  const chipList = skills => (skills && skills.length
    ? el("ul", { class: "chips" }, skills.map(s => el("li", {}, skillLabel(s))))
    : null);

  /* ---------- Certifications ---------- */
  function certStatus(cert) {
    // Only a retirement gets a label. A lapsed certification just shows its validity dates.
    return cert.retired ? el("span", { class: "tag" }, t("retiredBy", { issuer: cert.issuer })) : null;
  }

  // A group can turn the drawer off with "drawer": false.
  const certGroup = cert => state.data.certificationGroups.find(g => g.id === cert.group) || {};
  const hasDrawer = cert => certGroup(cert).drawer !== false;

  // The name is the link; CSS stretches its click area over the whole card or row.
  const certLink = cert => (hasDrawer(cert)
    ? el("a", { class: "cert-link", href: `#cert-${cert.id}` }, cert.name)
    : cert.name);

  function badgeCard(cert) {
    return el("li", { class: "badge-card", "data-skills": JSON.stringify(cert.skills) },
      cert.badge && el("img", { src: cert.badge, alt: "", width: "72", height: "72", loading: "lazy", decoding: "async" }),
      el("div", {},
        el("p", { class: "badge-card__code" }, cert.code, certStatus(cert)),
        el("p", { class: "badge-card__name" }, certLink(cert)),
        el("p", { class: "badge-card__date" }, certDate(cert))));
  }

  const certDate = cert => {
    const issued = cert.issued ? fmtMonth(cert.issued) : "";
    if (!cert.expires) return issued;
    const date = fmtMonth(cert.expires);
    if (isExpired(cert)) return issued ? `${issued} – ${date}` : t("until", { date });
    return issued ? `${issued} · ${t("validUntilInline", { date })}` : t("validUntil", { date });
  };

  function certRow(cert) {
    return el("li", { class: "cert-row", "data-skills": JSON.stringify(cert.skills) },
      el("span", { class: "cert-row__name" }, certLink(cert), certStatus(cert)),
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
          return el("li", { title: `${plural(u.roles, "role")}, ${plural(u.certs, "certification")}, ${plural(u.work, "workItem")}` }, s.label || s.name);
        })))));

    $("#language-list").replaceChildren(...languages.map(l =>
      el("div", {},
        el("dt", {},
          l.flag && el("img", { class: "flag", src: `assets/flags/${l.flag}.svg`, alt: "", width: "16", height: "16" }),
          l.name),
        l.level && el("dd", {}, l.level))));
  }

  /* ---------- Drawer ---------- */
  function openRole(id) {
    const role = state.roles.find(r => r.id === id);
    if (!role) { console.warn(`[resume] No role with id "${id}"`); return; }
    const siblings = state.roles.filter(r => r.company === role.company && r.id !== id);
    const companyLine = [role.company, role.location, role.mode].filter(Boolean).join(" · ");
    const place = placeById(role.place);
    const locator = place && el("canvas", { class: "drawer__globe", "aria-hidden": "true" });

    $("#drawer-body").replaceChildren(...[
      el("p", { class: `drawer__phase phase--${role.phase}` }, phaseName(role.phase)),
      el("h2", { id: "drawer-title" }, role.title),
      el("div", { class: "drawer__where" },
        locator,
        el("div", {},
          el("p", { class: "drawer__company" }, companyLine),
          el("p", { class: "drawer__dates" }, `${fmtRange(role)} · ${fmtDuration(roleMonths(role))}`),
          place && el("button", { type: "button", class: "skill-btn", onclick: () => showOnGlobe(place.id) }, t("showOnGlobe")))),
      role.summary && el("p", {}, role.summary),
      highlightList(role.highlights),
      role.skills.length ? el("h3", {}, t("skillsHeading")) : null,
      role.skills.length ? el("div", { class: "drawer__skills" }, role.skills.map(skillButton)) : null,
      siblings.length ? el("h3", {}, t("alsoAt", { company: role.company })) : null,
      siblings.length ? el("ul", { class: "drawer__siblings" }, siblings.map(r =>
        el("li", {}, el("a", { href: `#role-${r.id}` }, r.title), ` · ${fmtRange(r)}`))) : null
    ].filter(Boolean));

    if (locator) {
      createGlobe(locator).show(place.id, 3);
      loadGeo();
      if (mainGlobe) mainGlobe.peek(place.id);
    }
    showDrawer();
  }

  // Like a skill button: leave the drawer and go to the globe with the place selected.
  function showOnGlobe(placeId) {
    const place = placeById(placeId);
    const id = regionCode(place) || place.country;
    state.lastTrigger = null;   // focus goes to the place button, not back to the role
    setPlace(id);
    closeDrawer();
    location.hash = "places";
    const button = $(`#place-list [data-place="${id}"]`);
    if (button) button.focus({ preventScroll: true });
  }

  function showDrawer() {
    const drawer = $("#drawer");
    if (!drawer.open) drawer.showModal();
    drawer.scrollTop = 0;
    $("#drawer-close").focus();
  }

  const phaseName = id => (state.data.phases.find(p => p.id === id) || { name: "" }).name;

  function openCert(id) {
    const cert = state.data.certifications.find(c => c.id === id && hasDrawer(c));
    if (!cert) { console.warn(`[resume] No certification with details for id "${id}"`); closeDrawer(); return; }
    const group = certGroup(cert);
    // A renewal rule no longer applies once the certification has lapsed or been withdrawn.
    const validity = cert.retired || isExpired(cert) ? null : cert.validity || group.validity;
    const siblings = state.data.certifications.filter(c => c.group === cert.group && c.id !== id);
    const links = [
      cert.url && [t("certPage"), cert.url],
      cert.studyGuideUrl && [t("studyGuide"), cert.studyGuideUrl],
      cert.credentialUrl && [t("verifyCredential"), cert.credentialUrl]
    ].filter(Boolean);
    const fact = (label, value) => (value ? el("div", {}, el("dt", {}, label), el("dd", {}, value)) : null);

    $("#drawer-body").replaceChildren(...[
      el("div", { class: "drawer__cert-head" },
        cert.badge && el("img", { src: cert.badge, alt: "", width: "88", height: "88", decoding: "async" }),
        el("div", {},
          el("p", { class: "drawer__phase" }, [group.name, cert.code].filter(Boolean).join(" · ")),
          el("h2", { id: "drawer-title" }, cert.name),
          certStatus(cert))),
      el("dl", { class: "drawer__facts" },
        fact(t("issuer"), cert.issuer),
        fact(t("issued"), cert.issued && fmtMonth(cert.issued)),
        fact(isExpired(cert) ? t("expiredLabel") : t("validUntilLabel"), cert.expires && fmtMonth(cert.expires)),
        fact(t("renewal"), validity)),
      cert.about ? el("h3", {}, t("certAbout")) : null,
      cert.about ? el("p", {}, cert.about) : null,
      domainList(cert.domains),
      cert.skills.length ? el("h3", {}, t("skillsHeading")) : null,
      cert.skills.length ? el("div", { class: "drawer__skills" }, cert.skills.map(skillButton)) : null,
      links.length ? el("h3", {}, t("linksHeading")) : null,
      links.length ? el("ul", { class: "drawer__links" }, links.map(([label, url]) =>
        el("li", {}, el("a", { href: url, ...externalAttrs(url) }, label)))) : null,
      siblings.length ? el("h3", {}, t("alsoIn", { group: group.name })) : null,
      siblings.length ? el("ul", { class: "drawer__siblings" }, siblings.map(c =>
        el("li", {}, el("a", { href: `#cert-${c.id}` }, c.code ? `${c.code} · ${c.name}` : c.name)))) : null
    ].flat().filter(Boolean));

    showDrawer();
  }

  // Exam domains with their official weight ranges, drawn as bars scaled to the largest.
  function domainList(domains) {
    if (!domains || !domains.length) return null;
    const top = weight => Number((weight.match(/(\d+)\s*%/) || [0, 0])[1]);
    const max = Math.max(...domains.map(d => top(d.weight))) || 1;
    return [
      el("h3", {}, t("skillsMeasured")),
      el("ul", { class: "domains" }, domains.map(d => el("li", {},
        el("span", { class: "domains__row" }, el("span", {}, d.name), el("b", {}, d.weight)),
        el("span", { class: "domains__bar", "aria-hidden": "true" },
          el("i", { style: `width:${(top(d.weight) / max) * 100}%` })))))
    ];
  }

  const skillButton = s => el("button", {
    type: "button", class: "skill-btn",
    onclick: () => { setSkill(s); closeDrawer(); location.hash = "career"; }
  }, skillLabel(s));

  // The browser queues the dialog's close event, so the hash is cleared right away as
  // well. Otherwise selecting the same item again would not change the hash or reopen it.
  const DETAIL_HASH = /^#(role|cert)-/;
  function clearDetailHash() {
    if (DETAIL_HASH.test(location.hash)) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  function closeDrawer() {
    const drawer = $("#drawer");
    clearDetailHash();
    if (drawer.open) drawer.close();
  }

  function initDrawer() {
    const drawer = $("#drawer");
    $("#drawer-close").addEventListener("click", closeDrawer);
    // A click on the backdrop lands on the dialog element itself.
    drawer.addEventListener("click", e => { if (e.target === drawer) closeDrawer(); });
    drawer.addEventListener("cancel", clearDetailHash); // Esc
    drawer.addEventListener("close", () => {
      clearDetailHash();
      const trigger = state.lastTrigger;
      if (trigger && trigger.isConnected) trigger.focus();
    });
    // The browser only restores focus to what opened the dialog, and a hash change
    // loses that, so remember the control that was used.
    document.addEventListener("click", e => {
      const t = e.target.closest("button[data-role], a[href^='#role-'], a[href^='#cert-']");
      if (t && !drawer.contains(t)) state.lastTrigger = t;
    });
  }

  function syncHash() {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash.startsWith("role-")) openRole(hash.slice(5));
    else if (hash.startsWith("cert-")) openCert(hash.slice(5));
    else closeDrawer();
  }

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const targets = $$(".section__head, .timeline, .places, .company, .work__item, .cert-group, .toolkit");
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
    const places = new Set(data.places.map(p => p.id));
    const located = (owner, ids) => ids.forEach(id => {
      if (!places.has(id)) console.warn(`[resume] "${owner}" names an unknown place: "${id}". Add it to "places".`);
    });
    roles.forEach(r => {
      check(r.id, r.skills);
      if (!phases.has(r.phase)) console.warn(`[resume] "${r.id}" has an unknown phase: "${r.phase}".`);
    });
    data.experience.forEach(c => located(c.company, c.place ? [c.place] : []));
    data.work.forEach(w => { check(w.title, w.skills); located(w.title, w.places || []); });
    data.certifications.forEach(c => {
      check(c.name, c.skills);
      if (!groups.has(c.group)) console.warn(`[resume] "${c.name}" has an unknown group: "${c.group}".`);
    });
    const dupes = (list, kind) => list.filter((id, i) => list.indexOf(id) !== i)
      .forEach(id => console.warn(`[resume] Duplicate ${kind} id: "${id}".`));
    dupes(roles.map(r => r.id), "role");
    dupes(data.certifications.map(c => c.id), "certification");
    dupes(data.places.map(p => p.id), "place");
    data.places.forEach(p => {
      if (!continentOf(p.country).id) console.warn(`[resume] Place "${p.id}" has a country in no continent: "${p.country}". Add it to "continents".`);
    });
  }

  /* ---------- Boot ---------- */
  // Draws the whole page in the current language. It also runs on a language change.
  function render() {
    state.data = localize(state.raw, state.lang);
    state.roles = state.data.experience.flatMap(c => c.roles.map(r => ({
      ...r, company: c.company, location: c.location, place: c.place
    })));
    // The link id comes from the English data, so it is the same in both languages.
    state.data.certifications.forEach((c, i) => {
      const raw = state.raw.certifications[i];
      c.id = raw.id || slug(raw.code || localize(raw.name, "en"));
    });
    renderStaticText();
    renderHero();
    renderYears();
    renderSkillFilter();
    renderTimeline();
    renderPlaces();
    renderExperience();
    renderWork();
    renderCertifications();
    renderBackground();
    applyFilter();
  }

  async function init() {
    initControls();
    initDrawer();
    initGlobe();
    try {
      const res = await fetch("data/resume.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.raw = await res.json();
    } catch (err) {
      console.error("[resume] Could not load data/resume.json", err);
      $("#main").replaceChildren(el("p", { class: "wrap load-error" },
        "The resume data could not be loaded. If you opened this file directly from disk, serve the folder instead (see the README)."));
      return;
    }

    state.lang = initialLanguage();
    render();
    validate();
    initReveal();

    window.addEventListener("hashchange", syncHash);
    syncHash();
  }

  init();
})();
