"use strict";

/*
  Campus Colectivo guarda sus datos en IndexedDB para que este ejemplo funcione
  sin servidor. La interfaz solo consulta y actualiza esos registros.
*/
const DATABASE_NAME = "campus-colectivo";
const DATABASE_VERSION = 1;
const COURSE_GROUPS = ["Cálculo I", "Comunicación Académica", "Programación Web", "Psicología Social"];
const DEMO_PEOPLE = [
  { id: "student-mia", name: "Mía Salazar", career: "Diseño", year: "Tercer año", bio: "Me interesan el diseño editorial y las ideas que conectan personas.", email: "mia@campus.edu", campus: "Campus Central" },
  { id: "student-diego", name: "Diego Herrera", career: "Ingeniería en Sistemas", year: "Segundo año", bio: "Aprendiendo a construir cosas útiles con código.", email: "diego@campus.edu", campus: "Campus Central" },
  { id: "student-lucia", name: "Lucía Méndez", career: "Psicología", year: "Cuarto año", bio: "Curiosa por la psicología social y el aprendizaje.", email: "lucia@campus.edu", campus: "Campus Norte" },
  { id: "student-noah", name: "Noah Castillo", career: "Administración de Empresas", year: "Primer año", bio: "Me gusta compartir recursos y aprender en equipo.", email: "noah@campus.edu", campus: "Campus Central" }
];
const AVATAR_TONES = [1, 2, 3, 4, 5];
const TYPE_NAMES = { text: "Texto", question: "Duda", material: "Material" };
const ACTION_LABELS = {
  post_created: ["Publicaste", "↗"],
  like_added: ["Te gustó una publicación", "♡"],
  like_removed: ["Quitaste un me gusta", "♡"],
  comment_added: ["Comentaste", "◌"],
  post_deleted: ["Eliminaste una publicación", "×"],
  examples_cleared: ["Limpiaste los ejemplos", "⌁"]
};

const state = {
  db: null,
  profile: null,
  activeView: "feed",
  activeGroup: "",
  allGroups: [],
  toastTimer: null,
  recentlyLiked: ""
};

const el = function (selector, root) {
  return (root || document).querySelector(selector);
};
const all = function (selector, root) {
  return Array.from((root || document).querySelectorAll(selector));
};

function openDatabase() {
  return new Promise(function (resolve, reject) {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = function () {
      const database = request.result;
      if (!database.objectStoreNames.contains("profiles")) database.createObjectStore("profiles", { keyPath: "id" });
      if (!database.objectStoreNames.contains("posts")) database.createObjectStore("posts", { keyPath: "id" });
      if (!database.objectStoreNames.contains("likes")) database.createObjectStore("likes", { keyPath: "id" });
      if (!database.objectStoreNames.contains("comments")) database.createObjectStore("comments", { keyPath: "id" });
      if (!database.objectStoreNames.contains("history")) database.createObjectStore("history", { keyPath: "id" });
      if (!database.objectStoreNames.contains("meta")) database.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

function readAll(storeName) {
  return new Promise(function (resolve, reject) {
    const transaction = state.db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

function readRecord(storeName, key) {
  return new Promise(function (resolve, reject) {
    const transaction = state.db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

function saveRecord(storeName, record) {
  return new Promise(function (resolve, reject) {
    const transaction = state.db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(record);
    transaction.oncomplete = function () { resolve(); };
    transaction.onerror = function () { reject(transaction.error); };
    transaction.onabort = function () { reject(transaction.error); };
  });
}

function removeRecord(storeName, key) {
  return new Promise(function (resolve, reject) {
    const transaction = state.db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = function () { resolve(); };
    transaction.onerror = function () { reject(transaction.error); };
    transaction.onabort = function () { reject(transaction.error); };
  });
}

function saveMany(storeName, records) {
  return new Promise(function (resolve, reject) {
    const transaction = state.db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    records.forEach(function (record) { store.put(record); });
    transaction.oncomplete = function () { resolve(); };
    transaction.onerror = function () { reject(transaction.error); };
    transaction.onabort = function () { reject(transaction.error); };
  });
}

function makeId(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return prefix + "-" + window.crypto.randomUUID();
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function dateOffset(days, hours) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(date.getHours() - (hours || 0));
  return date.toISOString();
}

function demoPosts() {
  return [
    { id: "demo-post-1", authorId: "student-mia", type: "question", group: "Diseño", content: "¿Alguien ha encontrado una forma sencilla de ordenar una retícula editorial cuando el texto cambia a última hora? Estoy probando con columnas modulares, pero me cuesta mantener el ritmo visual.", tags: ["#duda", "#diseño"], createdAt: dateOffset(0, 2), demo: true },
    { id: "demo-post-2", authorId: "student-diego", type: "material", group: "Programación Web", content: "Dejo una guía corta para entender flexbox con ejemplos visuales. Me ayudó a dejar de memorizar propiedades y empezar a pensar en el espacio disponible.", tags: ["#apuntes", "#programación"], resourceUrl: "https://developer.mozilla.org/es/docs/Learn/CSS/CSS_layout/Flexbox", createdAt: dateOffset(0, 5), demo: true },
    { id: "demo-post-3", authorId: "student-lucia", type: "text", group: "Psicología Social", content: "En el seminario de hoy hablamos de cómo cambia una conversación cuando cada persona siente que su pregunta es bienvenida. Me quedé pensando en eso para nuestros grupos de estudio.", tags: ["#lectura", "#comunidad"], createdAt: dateOffset(1, 1), demo: true },
    { id: "demo-post-4", authorId: "student-noah", type: "question", group: "Cálculo I", content: "¿Qué recurso les sirvió para visualizar límites laterales? El capítulo del libro tiene buenos ejercicios, pero agradecería una explicación paso a paso.", tags: ["#duda", "#examen"], createdAt: dateOffset(2, 3), demo: true },
    { id: "demo-post-5", authorId: "student-mia", type: "material", group: "Diseño", content: "Comparto mis apuntes de jerarquía tipográfica y contraste. Son un resumen de la clase con algunos ejemplos que hice para el proyecto final.", tags: ["#apuntes", "#proyecto"], createdAt: dateOffset(3, 2), demo: true },
    { id: "demo-post-6", authorId: "student-diego", type: "text", group: "Comunicación Académica", content: "Pequeño recordatorio: explicar el porqué de una decisión técnica suele ser más útil que solo compartir el resultado. Hoy me ayudó a entender un error que llevaba horas persiguiendo.", tags: ["#aprendizaje"], createdAt: dateOffset(5, 4), demo: true }
  ];
}

async function seedExamplesIfNeeded() {
  const marker = await readRecord("meta", "examplesSeeded");
  if (marker) return;
  await saveMany("profiles", DEMO_PEOPLE.map(function (person) {
    return Object.assign({ avatarTone: profileTone(person.name), demo: true }, person);
  }));
  await saveMany("posts", demoPosts());
  await saveMany("likes", [
    { id: "student-lucia_demo-post-1", userId: "student-lucia", postId: "demo-post-1", createdAt: dateOffset(0, 1), demo: true },
    { id: "student-diego_demo-post-1", userId: "student-diego", postId: "demo-post-1", createdAt: dateOffset(0, 1), demo: true },
    { id: "student-noah_demo-post-2", userId: "student-noah", postId: "demo-post-2", createdAt: dateOffset(0, 3), demo: true },
    { id: "student-mia_demo-post-2", userId: "student-mia", postId: "demo-post-2", createdAt: dateOffset(0, 3), demo: true },
    { id: "student-diego_demo-post-3", userId: "student-diego", postId: "demo-post-3", createdAt: dateOffset(1, 0), demo: true },
    { id: "student-noah_demo-post-3", userId: "student-noah", postId: "demo-post-3", createdAt: dateOffset(1, 0), demo: true },
    { id: "student-lucia_demo-post-5", userId: "student-lucia", postId: "demo-post-5", createdAt: dateOffset(2, 0), demo: true }
  ]);
  await saveMany("comments", [
    { id: "demo-comment-1", userId: "student-diego", postId: "demo-post-1", content: "Prueba fijar primero el ancho de columna y dejar que el texto se acomode dentro.", createdAt: dateOffset(0, 1), demo: true },
    { id: "demo-comment-2", userId: "student-noah", postId: "demo-post-1", content: "A mí me ayuda separar la retícula base de las excepciones del titular.", createdAt: dateOffset(0, 1), demo: true },
    { id: "demo-comment-3", userId: "student-mia", postId: "demo-post-2", content: "¡Gracias! Justo buscaba una explicación así de visual.", createdAt: dateOffset(0, 2), demo: true },
    { id: "demo-comment-4", userId: "student-mia", postId: "demo-post-4", content: "La visualización de 3Blue1Brown sobre cálculo me aclaró bastante esa parte.", createdAt: dateOffset(1, 3), demo: true }
  ]);
  await saveRecord("meta", { key: "examplesSeeded", value: true });
}

function profileTone(name) {
  let total = 0;
  for (let index = 0; index < name.length; index += 1) total = (total + name.charCodeAt(index) * (index + 3)) % AVATAR_TONES.length;
  return AVATAR_TONES[total];
}

function initials(name) {
  return String(name || "CC").trim().split(/\s+/).slice(0, 2).map(function (part) {
    return part.charAt(0).toLocaleUpperCase("es");
  }).join("") || "CC";
}

function escapeHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
  });
}

function avatarMarkup(person, size) {
  const tone = person && person.avatarTone ? person.avatarTone : profileTone(person ? person.name : "Campus");
  const safeTone = AVATAR_TONES.includes(Number(tone)) ? Number(tone) : 1;
  return '<span class="avatar avatar-' + escapeHTML(size || "small") + '" style="--avatar-a:var(--avatar-tone-' + safeTone + '-a);--avatar-b:var(--avatar-tone-' + safeTone + '-b)" aria-hidden="true">' +
    escapeHTML(initials(person && person.name)) + "</span>";
}

function profileMarkup(person) {
  const bio = person.bio ? escapeHTML(person.bio) : "Aún no ha añadido una descripción.";
  const campus = person.campus ? escapeHTML(person.campus) : "Campus no indicado";
  return '<div class="review-top">' + avatarMarkup(person, "medium") + '<div><strong>' + escapeHTML(person.name) +
    '</strong><small>' + escapeHTML(person.career) + " · " + escapeHTML(person.year) + '</small></div></div>' +
    '<p class="review-bio">' + bio + "</p>" +
    '<p class="review-contact">' + escapeHTML(person.email) + "</p>" +
    '<p class="review-campus">' + campus + "</p>";
}

function getGroups(career) {
  const names = [career].concat(DEMO_PEOPLE.map(function (person) { return person.career; }), COURSE_GROUPS);
  const seen = new Set();
  return names.filter(function (name) {
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  }).map(function (name, index) {
    return { name: name, type: COURSE_GROUPS.includes(name) ? "Curso" : "Carrera" };
  });
}

function groupOptions(selected) {
  return state.allGroups.map(function (group) {
    const chosen = group.name === selected ? " selected" : "";
    return '<option value="' + escapeHTML(group.name) + '"' + chosen + ">" + escapeHTML(group.name) + "</option>";
  }).join("");
}

function setTheme(theme) {
  const selectedTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = selectedTheme;
  try { localStorage.setItem("campus-colectivo-theme", selectedTheme); } catch (error) { /* El tema sigue activo durante esta sesión. */ }
  all("[data-theme-toggle]").forEach(function (button) {
    const darkIsActive = selectedTheme === "dark";
    button.setAttribute("aria-pressed", String(darkIsActive));
    button.setAttribute("aria-label", darkIsActive ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
    const label = el(".theme-label", button);
    if (label) label.textContent = darkIsActive ? "Modo claro" : (button.classList.contains("compact-toggle") ? "Tema" : "Modo oscuro");
  });
}

function readSavedTheme() {
  let theme = "light";
  try { theme = localStorage.getItem("campus-colectivo-theme") || "light"; } catch (error) { theme = "light"; }
  setTheme(theme);
}

function updateLivePreview() {
  const selectedCareer = el("#profile-career").value;
  const person = {
    name: el("#profile-name").value.trim() || "Tu nombre",
    career: (selectedCareer === "Otra carrera" ? el("#profile-other-career").value.trim() : selectedCareer) || "Tu carrera",
    year: el("#profile-year").value || "Año de estudio",
    email: el("#profile-email").value.trim() || "tu@universidad.edu",
    campus: el("#profile-campus").value.trim(),
    bio: el("#profile-bio").value.trim() || "Tu descripción aparecerá aquí. Comparte un poco de lo que te interesa."
  };
  person.avatarTone = profileTone(person.name);
  el("#review-profile").innerHTML = profileMarkup(person);
  el("#bio-count").textContent = String(el("#profile-bio").value.length);
}

function showStep(stepNumber) {
  all("[data-form-step]").forEach(function (step) {
    const active = Number(step.dataset.formStep) === stepNumber;
    step.hidden = !active;
    step.classList.toggle("is-active", active);
  });
  all("[data-step-indicator]").forEach(function (indicator) {
    const step = Number(indicator.dataset.stepIndicator);
    indicator.classList.toggle("is-current", step === stepNumber);
    indicator.classList.toggle("is-done", step < stepNumber);
  });
  el("#step-count").textContent = "0" + stepNumber + " / 03";
  el("#stepper-progress").style.width = ((stepNumber - 1) * 50) + "%";
  if (stepNumber === 3) updateLivePreview();
}

function validateRegistrationStep(stepNumber) {
  const name = el("#profile-name");
  const career = el("#profile-career");
  const year = el("#profile-year");
  const email = el("#profile-email");
  let valid = true;
  if (stepNumber === 1) {
    const nameValid = name.value.trim().length >= 2;
    el("#name-error").textContent = nameValid ? "" : "Escribe tu nombre con al menos dos caracteres.";
    if (!nameValid) { name.setAttribute("aria-invalid", "true"); name.focus(); valid = false; }
    else name.removeAttribute("aria-invalid");
    const careerValid = Boolean(career.value) && (career.value !== "Otra carrera" || el("#profile-other-career").value.trim().length >= 2);
    el("#career-error").textContent = careerValid ? "" : (career.value === "Otra carrera" ? "Escribe el nombre de tu carrera." : "Selecciona tu carrera.");
    if (!careerValid) {
      const careerField = career.value === "Otra carrera" ? el("#profile-other-career") : career;
      careerField.setAttribute("aria-invalid", "true");
      if (careerField !== career) career.removeAttribute("aria-invalid");
      if (valid) careerField.focus();
      valid = false;
    } else {
      career.removeAttribute("aria-invalid");
      el("#profile-other-career").removeAttribute("aria-invalid");
    }
    const yearValid = Boolean(year.value);
    el("#year-error").textContent = yearValid ? "" : "Selecciona tu año de estudio.";
    if (!yearValid) { year.setAttribute("aria-invalid", "true"); if (valid) year.focus(); valid = false; }
    else year.removeAttribute("aria-invalid");
  }
  if (stepNumber === 2) {
    const emailValid = email.validity.valid && email.value.trim().length > 0;
    el("#email-error").textContent = emailValid ? "" : "Escribe un correo con un formato válido.";
    if (!emailValid) { email.setAttribute("aria-invalid", "true"); email.focus(); valid = false; }
    else email.removeAttribute("aria-invalid");
  }
  return valid;
}

function createProfileFromForm() {
  const form = el("#register-form");
  const formValues = new FormData(form);
  const name = String(formValues.get("name") || "").trim();
  return {
    id: makeId("profile"),
    name: name,
    career: String(formValues.get("career") === "Otra carrera" ? formValues.get("otherCareer") : formValues.get("career") || "").trim(),
    year: String(formValues.get("year") || "").trim(),
    email: String(formValues.get("email") || "").trim(),
    campus: String(formValues.get("campus") || "").trim(),
    bio: String(formValues.get("bio") || "").trim(),
    avatarTone: profileTone(name),
    createdAt: new Date().toISOString(),
    demo: false
  };
}

async function recordAction(action, details) {
  const entry = Object.assign({
    id: makeId("event"),
    action: action,
    userId: state.profile.id,
    createdAt: new Date().toISOString()
  }, details || {});
  await saveRecord("history", entry);
}

function setCurrentProfileLabels() {
  const person = state.profile;
  all("[data-current-name]").forEach(function (node) { node.textContent = person.name; });
  all("[data-current-career]").forEach(function (node) { node.textContent = person.career; });
  all("[data-current-avatar]").forEach(function (node) {
    node.textContent = initials(person.name);
    node.style.setProperty("--avatar-a", "var(--avatar-tone-" + person.avatarTone + "-a)");
    node.style.setProperty("--avatar-b", "var(--avatar-tone-" + person.avatarTone + "-b)");
  });
}

function setUpGroups() {
  state.allGroups = getGroups(state.profile.career);
  el(".section-count").textContent = String(state.allGroups.length);
  el("#filter-group").innerHTML = '<option value="">Todos los grupos</option>' + groupOptions("");
  el("#post-group").innerHTML = groupOptions(state.profile.career);
  el("#sidebar-groups").innerHTML = state.allGroups.map(function (group, index) {
    return '<button type="button" class="group-nav" data-group="' + escapeHTML(group.name) + '">' +
      '<span class="group-dot" aria-hidden="true"></span><span>' + escapeHTML(group.name) + "</span></button>";
  }).join("");
}

function setWelcomeDate() {
  const text = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  el("#feed-eyebrow").textContent = text.toLocaleUpperCase("es");
}

async function enterCommunity() {
  el("#welcome-screen").hidden = true;
  el("#app-screen").hidden = false;
  setCurrentProfileLabels();
  setUpGroups();
  setWelcomeDate();
  renderActiveGroups();
  setView("feed");
  await renderFeed(true);
}

function setView(viewName) {
  state.activeView = viewName;
  all(".app-view").forEach(function (view) {
    const active = view.dataset.view === viewName;
    view.classList.toggle("is-visible", active);
    view.hidden = !active;
  });
  all(".main-nav [data-view-link]").forEach(function (button) {
    button.classList.toggle("is-active", button.dataset.viewLink === viewName);
  });
  all(".mobile-nav [data-view-link]").forEach(function (button) {
    button.classList.toggle("is-active", button.dataset.viewLink === viewName);
  });
  if (viewName === "activity") renderActivity();
  if (viewName === "profile") renderProfile();
  if (viewName === "feed") renderFeed(false);
}

function safeResourceURL(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
  } catch (error) { return ""; }
  return "";
}

function timeAgo(isoDate) {
  const elapsed = Math.max(0, Date.now() - new Date(isoDate).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return "hace " + minutes + " min";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return "hace " + hours + (hours === 1 ? " hora" : " horas");
  const days = Math.floor(hours / 24);
  if (days < 7) return "hace " + days + (days === 1 ? " día" : " días");
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "short" }).format(new Date(isoDate));
}

function formatDateTime(isoDate) {
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(isoDate));
}

function getPostTags(content) {
  const matches = String(content).match(/#[a-zA-Z0-9_áéíóúüñÁÉÍÓÚÜÑ-]+/g) || [];
  return Array.from(new Set(matches.map(function (tag) { return tag.toLocaleLowerCase("es"); })));
}

function updateTagOptions(posts) {
  const select = el("#filter-tag");
  const selected = select.value;
  const tags = new Set(["#duda", "#apuntes", "#examen", "#proyecto", "#lectura"]);
  posts.forEach(function (post) {
    (post.tags || []).concat(getPostTags(post.content)).forEach(function (tag) {
      tags.add(String(tag).toLocaleLowerCase("es"));
    });
  });
  select.innerHTML = '<option value="">Todas las etiquetas</option>' + Array.from(tags).sort().map(function (tag) {
    return '<option value="' + escapeHTML(tag) + '">' + escapeHTML(tag) + "</option>";
  }).join("");
  select.value = selected;
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function commentMarkup(comment, person) {
  return '<div class="comment-item">' + avatarMarkup(person || { name: "Estudiante" }, "tiny") +
    '<div class="comment-body"><strong>' + escapeHTML(person ? person.name : "Estudiante") + "</strong><span>" +
    escapeHTML(comment.content) + '</span><small class="comment-time">' + escapeHTML(timeAgo(comment.createdAt)) + "</small></div></div>";
}

function postMarkup(post, person, likes, comments, profiles) {
  const author = person || { name: "Estudiante", career: "Comunidad" };
  const ownPost = post.authorId === state.profile.id;
  const likeCount = likes.filter(function (like) { return like.postId === post.id; }).length;
  const liked = likes.some(function (like) { return like.postId === post.id && like.userId === state.profile.id; });
  const postComments = comments.filter(function (comment) { return comment.postId === post.id; });
  const type = TYPE_NAMES[post.type] || "Texto";
  const typeClass = post.type === "question" ? " question" : (post.type === "material" ? " material" : "");
  const resource = safeResourceURL(post.resourceUrl);
  const tags = Array.from(new Set((post.tags || []).concat(getPostTags(post.content))));
  const tagMarkup = tags.length ? '<div class="post-tags">' + tags.map(function (tag) {
    return '<button class="post-tag" type="button" data-tag="' + escapeHTML(tag) + '">' + escapeHTML(tag) + "</button>";
  }).join("") + "</div>" : "";
  const commentsMarkup = postComments.length ? postComments.map(function (comment) {
    return commentMarkup(comment, profiles.get(comment.userId));
  }).join("") : '<p class="empty-comments">Sé la primera persona en responder.</p>';
  return '<article class="post-card card" data-post-id="' + escapeHTML(post.id) + '">' +
    '<div class="post-top">' + avatarMarkup(author, "small") +
    '<div class="post-author"><strong>' + escapeHTML(author.name) + '</strong><div class="post-meta"><span>' +
    escapeHTML(author.career || "Estudiante") + '</span><span class="meta-dot">·</span><time datetime="' +
    escapeHTML(post.createdAt) + '">' + escapeHTML(timeAgo(post.createdAt)) + '</time></div></div>' +
    '<span class="post-type' + typeClass + '">' + escapeHTML(type) + '</span>' +
    (ownPost ? '<button class="post-delete" type="button" data-action="delete" aria-label="Eliminar mi publicación" title="Eliminar publicación">⌫</button>' : "") +
    '</div><p class="post-content">' + escapeHTML(post.content) + "</p>" +
    (resource ? '<a class="post-resource" href="' + escapeHTML(resource) + '" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">↗</span> Abrir material</a>' : "") +
    tagMarkup + '<div class="post-actions"><button type="button" class="post-action like-button' + (liked ? " is-liked" : "") +
    '" data-action="like" aria-pressed="' + String(liked) + '"><span class="heart' + (state.recentlyLiked === post.id && liked ? " just-liked" : "") + '" aria-hidden="true">' + (liked ? "♥" : "♡") +
    '</span><span>Me gusta</span><span class="like-count">' + likeCount + "</span></button>" +
    '<div class="post-comment-wrap"><details><summary>' + postComments.length + (postComments.length === 1 ? " comentario" : " comentarios") +
    '</summary><div class="comments-panel"><div class="comment-list">' + commentsMarkup + '</div><form class="comment-form" data-post-id="' +
    escapeHTML(post.id) + '"><label class="sr-only" for="comment-' + escapeHTML(post.id) + '">Escribe un comentario</label><input id="comment-' +
    escapeHTML(post.id) + '" name="comment" maxlength="300" required placeholder="Aporta a la conversación"><button type="submit">Enviar</button></form></div></details></div></div></article>';
}

function renderSkeletons() {
  el("#post-list").setAttribute("aria-busy", "true");
  el("#post-list").innerHTML = '<div class="skeleton" aria-hidden="true"></div><div class="skeleton" aria-hidden="true"></div>';
}

async function renderFeed(showSkeleton) {
  if (el("#app-screen").hidden) return;
  if (showSkeleton) renderSkeletons();
  const values = await Promise.all([readAll("posts"), readAll("profiles"), readAll("likes"), readAll("comments")]);
  const posts = values[0];
  const profiles = new Map(values[1].map(function (person) { return [person.id, person]; }));
  if (state.profile) profiles.set(state.profile.id, state.profile);
  const likes = values[2];
  const comments = values[3];
  updateTagOptions(posts);
  const query = el("#search-posts").value.trim().toLocaleLowerCase("es");
  const type = el("#filter-type").value;
  const group = el("#filter-group").value || state.activeGroup;
  const tag = el("#filter-tag").value.toLocaleLowerCase("es");
  const matching = posts.filter(function (post) {
    const author = profiles.get(post.authorId);
    const terms = [post.content, post.group, author ? author.name : "", (post.tags || []).join(" ")].join(" ").toLocaleLowerCase("es");
    const postTags = (post.tags || []).concat(getPostTags(post.content)).map(function (item) { return item.toLocaleLowerCase("es"); });
    return (!query || terms.includes(query)) && (!type || post.type === type) && (!group || post.group === group) && (!tag || postTags.includes(tag));
  }).sort(function (left, right) { return new Date(right.createdAt) - new Date(left.createdAt); });
  el("#post-count-label").textContent = matching.length + (matching.length === 1 ? " publicación" : " publicaciones");
  el("#feed-list-title").textContent = group ? group : "Lo que está pasando";
  if (matching.length) {
    el("#post-list").innerHTML = matching.map(function (post) {
      return postMarkup(post, profiles.get(post.authorId), likes, comments, profiles);
    }).join("");
  } else {
    const hasFilters = Boolean(query || type || group || tag);
    el("#post-list").innerHTML = '<section class="empty-state"><span class="empty-illustration" aria-hidden="true">' +
      (hasFilters ? "⌕" : "✳") + '</span><h3>' + (hasFilters ? "No encontramos coincidencias" : "El espacio está esperando tu primera idea") +
      '</h3><p>' + (hasFilters ? "Prueba otro término o cambia los filtros para ver más publicaciones." : "Comparte una pregunta, un apunte o algo que hayas aprendido.") +
      '</p>' + (hasFilters ? '<button class="button button-secondary" type="button" data-action="clear-filters">Limpiar filtros</button>' :
        '<button class="button button-primary" type="button" data-action="new-post">Crear publicación</button>') + "</section>";
  }
  el("#post-list").setAttribute("aria-busy", "false");
  all(".group-nav").forEach(function (button) {
    button.classList.toggle("is-active", button.dataset.group === state.activeGroup);
  });
  renderActiveGroups(posts);
}

async function renderActiveGroups(posts) {
  const postList = posts || await readAll("posts");
  const groups = state.allGroups.length ? state.allGroups : COURSE_GROUPS.map(function (name) { return { name: name, type: "Curso" }; });
  const counts = new Map();
  postList.forEach(function (post) { counts.set(post.group, (counts.get(post.group) || 0) + 1); });
  const active = groups.slice().sort(function (a, b) { return (counts.get(b.name) || 0) - (counts.get(a.name) || 0); }).slice(0, 4);
  el("#active-groups").innerHTML = active.map(function (group, index) {
    return '<div class="active-group"><span class="group-symbol" aria-hidden="true">' + ["◈", "⌘", "✳", "◉"][index % 4] +
      '</span><div><strong>' + escapeHTML(group.name) + '</strong><small>' + (counts.get(group.name) || 0) +
      ((counts.get(group.name) || 0) === 1 ? " publicación" : " publicaciones") + "</small></div></div>";
  }).join("");
}

function showToast(message, alertStyle) {
  const toast = document.createElement("div");
  toast.className = "toast" + (alertStyle ? " is-alert" : "");
  toast.innerHTML = '<span class="toast-mark" aria-hidden="true">' + (alertStyle ? "!" : "✓") + "</span><span>" + escapeHTML(message) + "</span>";
  el("#toast-region").appendChild(toast);
  window.setTimeout(function () {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(5px)";
    window.setTimeout(function () { toast.remove(); }, 220);
  }, 3200);
}

async function createPost(form) {
  const values = new FormData(form);
  const content = String(values.get("content") || "").trim();
  const group = String(values.get("group") || "").trim();
  if (!content) {
    el("#composer-error").textContent = "Escribe algo antes de publicar.";
    el("#post-content").focus();
    return;
  }
  const resourceUrl = String(values.get("resourceUrl") || "").trim();
  if (resourceUrl && !safeResourceURL(resourceUrl)) {
    el("#composer-error").textContent = "El enlace debe comenzar con http:// o https://.";
    el("#post-resource").focus();
    return;
  }
  const post = {
    id: makeId("post"),
    authorId: state.profile.id,
    type: String(values.get("type") || "text"),
    group: group,
    content: content,
    tags: getPostTags(content),
    resourceUrl: resourceUrl,
    createdAt: new Date().toISOString(),
    demo: false
  };
  await saveRecord("posts", post);
  await recordAction("post_created", { postId: post.id, detail: content.slice(0, 100) });
  form.reset();
  el("#post-character-count").textContent = "0 / 700";
  el("#composer-error").textContent = "";
  el("#resource-field").hidden = true;
  el("#composer-dialog").close();
  el("#filter-type").value = "";
  el("#filter-tag").value = "";
  el("#filter-group").value = "";
  state.activeGroup = "";
  setView("feed");
  await renderFeed(false);
  showToast("Tu publicación ya está en la comunidad.");
}

async function toggleLike(postId) {
  const id = state.profile.id + "_" + postId;
  const existing = await readRecord("likes", id);
  if (existing) {
    state.recentlyLiked = "";
    await removeRecord("likes", id);
    await recordAction("like_removed", { postId: postId });
  } else {
    state.recentlyLiked = postId;
    await saveRecord("likes", { id: id, userId: state.profile.id, postId: postId, createdAt: new Date().toISOString(), demo: false });
    await recordAction("like_added", { postId: postId });
  }
  await renderFeed(false);
  state.recentlyLiked = "";
}

async function addComment(form) {
  const content = String(new FormData(form).get("comment") || "").trim();
  const postId = form.dataset.postId;
  if (!content) return;
  const comment = { id: makeId("comment"), userId: state.profile.id, postId: postId, content: content, createdAt: new Date().toISOString(), demo: false };
  await saveRecord("comments", comment);
  await recordAction("comment_added", { postId: postId, detail: content.slice(0, 100) });
  await renderFeed(false);
  const card = el('[data-post-id="' + CSS.escape(postId) + '"]');
  if (card) {
    const details = el("details", card);
    if (details) details.open = true;
    const input = el(".comment-form input", card);
    if (input) input.focus();
  }
  showToast("Tu comentario se añadió a la conversación.");
}

async function deletePost(postId) {
  const post = await readRecord("posts", postId);
  if (!post || post.authorId !== state.profile.id) {
    showToast("Solo puedes eliminar tus propias publicaciones.", true);
    return;
  }
  if (!window.confirm("¿Eliminar esta publicación? Esta acción no se puede deshacer.")) return;
  const likes = (await readAll("likes")).filter(function (like) { return like.postId === postId; });
  const comments = (await readAll("comments")).filter(function (comment) { return comment.postId === postId; });
  await removeRecord("posts", postId);
  for (const like of likes) await removeRecord("likes", like.id);
  for (const comment of comments) await removeRecord("comments", comment.id);
  await recordAction("post_deleted", { postId: postId, detail: post.content.slice(0, 100) });
  await renderFeed(false);
  showToast("La publicación se eliminó.");
}

async function clearExamples() {
  if (!window.confirm("Se quitarán las publicaciones, likes y comentarios de ejemplo. Tu perfil y tus publicaciones se conservarán.")) return;
  const stores = ["posts", "likes", "comments", "profiles"];
  for (const storeName of stores) {
    const records = await readAll(storeName);
    for (const record of records) {
      const relatedDemo = record.demo || (record.postId && record.postId.indexOf("demo-post-") === 0) ||
        (record.id && record.id.indexOf("demo-post-") === 0);
      if (relatedDemo && !(storeName === "profiles" && record.id === state.profile.id)) await removeRecord(storeName, record.id);
    }
  }
  await saveRecord("meta", { key: "examplesSeeded", value: true });
  await recordAction("examples_cleared", { detail: "Se quitaron las publicaciones de ejemplo." });
  await renderFeed(false);
  await renderActivity();
  showToast("Se limpiaron las publicaciones de ejemplo.");
}

function animateNumber(node, target) {
  const finish = Number(target) || 0;
  const startTime = performance.now();
  const duration = 500;
  function frame(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    node.textContent = String(Math.round(finish * eased));
    if (progress < 1) window.requestAnimationFrame(frame);
  }
  node.textContent = "0";
  window.requestAnimationFrame(frame);
}

function svgWeekChart(counts) {
  const width = 480;
  const height = 145;
  const left = 20;
  const right = 15;
  const top = 15;
  const bottom = 28;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const max = Math.max(3, ...counts.map(function (item) { return item.count; }));
  const points = counts.map(function (item, index) {
    const x = left + (plotWidth * index / 6);
    const y = top + plotHeight - (item.count / max) * plotHeight;
    return { x: x, y: y, item: item };
  });
  const guides = [0, 1, 2].map(function (index) {
    const y = top + (plotHeight * index / 2);
    return '<line x1="' + left + '" y1="' + y + '" x2="' + (width - right) + '" y2="' + y + '" stroke="var(--line)" stroke-dasharray="3 5"/>';
  }).join("");
  const polyline = points.map(function (point) { return point.x + "," + point.y; }).join(" ");
  const areaPoints = left + "," + (height - bottom) + " " + polyline + " " + (width - right) + "," + (height - bottom);
  const dots = points.map(function (point) {
    const label = escapeHTML(point.item.label + ": " + point.item.count + (point.item.count === 1 ? " actividad" : " actividades"));
    return '<circle cx="' + point.x + '" cy="' + point.y + '" r="4" fill="var(--blue)" stroke="var(--paper)" stroke-width="2"><title>' + label + "</title></circle>" +
      '<text x="' + point.x + '" y="' + (height - 7) + '" text-anchor="middle" fill="var(--text-faint)" font-size="9">' + escapeHTML(point.item.short) + "</text>";
  }).join("");
  return '<svg viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="Gráfico de actividad de los últimos siete días">' +
    guides + '<polygon points="' + areaPoints + '" fill="var(--blue-soft)" opacity=".72"/><polyline points="' + polyline +
    '" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' + dots + "</svg>";
}

function activitySvg(events) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const firstDay = new Date(today);
  firstDay.setDate(today.getDate() - 55);
  const countsByDate = new Map();
  events.forEach(function (event) {
    const key = localDateKey(event.createdAt);
    countsByDate.set(key, (countsByDate.get(key) || 0) + 1);
  });
  let maxCount = 1;
  for (const count of countsByDate.values()) maxCount = Math.max(maxCount, count);
  const cells = [];
  for (let index = 0; index < 56; index += 1) {
    const day = new Date(firstDay);
    day.setDate(firstDay.getDate() + index);
    const key = localDateKey(day);
    const count = countsByDate.get(key) || 0;
    const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / maxCount) * 4));
    const x = Math.floor(index / 7) * 13;
    const y = day.getDay() * 13;
    cells.push('<rect class="heatmap-cell heat-' + level + '" x="' + x + '" y="' + y + '" width="10" height="10" rx="2"><title>' +
      escapeHTML(new Intl.DateTimeFormat("es", { day: "numeric", month: "short" }).format(day) + ": " + count + (count === 1 ? " interacción" : " interacciones")) +
      "</title></rect>");
  }
  const dayLabels = ["D", "L", "M", "X", "J", "V", "S"].map(function (label, index) {
    return '<text x="-6" y="' + (index * 13 + 8) + '" text-anchor="end" fill="var(--text-faint)" font-size="7">' + label + "</text>";
  }).join("");
  const monthLabels = [];
  let previousMonth = "";
  for (let week = 0; week < 8; week += 1) {
    const day = new Date(firstDay);
    day.setDate(firstDay.getDate() + week * 7);
    const month = day.toLocaleDateString("es", { month: "short" });
    if (month !== previousMonth) {
      monthLabels.push('<text x="' + (week * 13) + '" y="-5" fill="var(--text-faint)" font-size="7">' + escapeHTML(month) + "</text>");
      previousMonth = month;
    }
  }
  return '<svg viewBox="-12 -10 112 101" role="img" aria-label="Mapa de actividad de las últimas ocho semanas">' + monthLabels.join("") +
    dayLabels + cells.join("") + "</svg>" +
    '<div class="heatmap-legend"><span>Menos</span>' + [0, 1, 2, 3, 4].map(function (level) {
      return '<span class="legend-cell heat-' + level + '" aria-hidden="true"></span>';
    }).join("") + "<span>Más</span></div>";
}

function getEventsForLastDays(events, days) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return events.filter(function (event) { return new Date(event.createdAt) >= start; });
}

async function renderActivity() {
  if (!state.profile) return;
  const values = await Promise.all([readAll("posts"), readAll("likes"), readAll("comments"), readAll("history")]);
  const posts = values[0];
  const likes = values[1];
  const comments = values[2];
  const events = values[3].filter(function (event) { return event.userId === state.profile.id; })
    .sort(function (left, right) { return new Date(right.createdAt) - new Date(left.createdAt); });
  const ownPosts = posts.filter(function (post) { return post.authorId === state.profile.id; });
  const ownPostIds = new Set(ownPosts.map(function (post) { return post.id; }));
  const receivedLikes = likes.filter(function (like) { return ownPostIds.has(like.postId); }).length;
  const receivedComments = comments.filter(function (comment) { return ownPostIds.has(comment.postId); }).length;
  animateNumber(el('[data-stat="posts"]'), ownPosts.length);
  animateNumber(el('[data-stat="likes"]'), receivedLikes);
  animateNumber(el('[data-stat="comments"]'), receivedComments);

  const typeNames = [["text", "Texto", "var(--blue)"], ["question", "Dudas", "var(--ink-500)"], ["material", "Material", "var(--material)"]];
  const typeCounts = typeNames.map(function (entry) {
    return { type: entry[0], label: entry[1], color: entry[2], count: ownPosts.filter(function (post) { return post.type === entry[0]; }).length };
  });
  const maxType = Math.max(1, ...typeCounts.map(function (entry) { return entry.count; }));
  el("#type-chart").innerHTML = typeCounts.map(function (entry) {
    const width = entry.count === 0 ? 0 : Math.max(5, Math.round(entry.count / maxType * 100));
    return '<div class="type-row"><span class="type-name">' + entry.label + '</span><span class="type-bar"><span style="width:' +
      width + "%;--bar-color:" + entry.color + '"></span></span><span class="type-value">' + entry.count + "</span></div>";
  }).join("") + (ownPosts.length === 0 ? '<p class="chart-empty">Tus publicaciones aparecerán aquí.</p>' : "");

  const lastWeek = getEventsForLastDays(events, 7);
  const weekCounts = [];
  const weekday = new Intl.DateTimeFormat("es", { weekday: "short" });
  for (let index = 6; index >= 0; index -= 1) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - index);
    const key = day.toLocaleDateString("en-CA");
    const count = lastWeek.filter(function (event) { return localDateKey(event.createdAt) === key; }).length;
    const label = weekday.format(day);
    weekCounts.push({ label: label, short: label.replace(".", "").slice(0, 2), count: count });
  }
  el("#week-chart").innerHTML = svgWeekChart(weekCounts);
  el("#heatmap-chart").innerHTML = activitySvg(events);
  el("#history-list").innerHTML = events.slice(0, 20).map(function (event) {
    const action = ACTION_LABELS[event.action] || ["Actividad", "•"];
    const className = event.action === "post_deleted" ? " is-delete" : (event.action.indexOf("like_") === 0 ? " is-like" : "");
    const detail = event.detail || (event.postId ? "Publicación de la comunidad" : "Interacción registrada");
    return "<tr><td><span class=\"history-action-label" + className + '\"><span class="history-mark" aria-hidden="true">' +
      escapeHTML(action[1]) + "</span>" + escapeHTML(action[0]) + "</span></td><td>" + escapeHTML(detail) +
      "</td><td>" + escapeHTML(formatDateTime(event.createdAt)) + "</td></tr>";
  }).join("");
  const hasHistory = events.length > 0;
  el("#empty-history").hidden = hasHistory;
  el(".history-table-wrap").hidden = !hasHistory;
}

async function renderProfile() {
  if (!state.profile) return;
  const person = state.profile;
  const ownPosts = (await readAll("posts")).filter(function (post) { return post.authorId === person.id; }).length;
  el("#profile-page-card").innerHTML = '<div class="profile-cover"></div><div class="profile-main"><div class="profile-main-head">' +
    avatarMarkup(person, "large") + '<p class="profile-public-label">Perfil de estudiante</p></div><h2>' + escapeHTML(person.name) +
    "</h2><p class=\"career-line\">" + escapeHTML(person.career) + " · " + escapeHTML(person.year) + "</p>" +
    '<p class="bio-line">' + (person.bio ? escapeHTML(person.bio) : "Aún no has añadido una descripción.") + "</p>" +
    '<div class="profile-details"><div class="profile-detail"><span aria-hidden="true">◎</span><div><small>Universidad o campus</small><strong>' +
    escapeHTML(person.campus || "No indicado") + '</strong></div></div><div class="profile-detail"><span aria-hidden="true">✉</span><div><small>Correo</small><strong>' +
    escapeHTML(person.email) + '</strong></div></div><div class="profile-detail"><span aria-hidden="true">↗</span><div><small>Publicaciones</small><strong>' +
    ownPosts + (ownPosts === 1 ? " publicación" : " publicaciones") + "</strong></div></div></div></div>";
}

function exportHistoryCSV() {
  readAll("history").then(function (allEvents) {
    const events = allEvents.filter(function (event) { return event.userId === state.profile.id; })
      .sort(function (left, right) { return new Date(left.createdAt) - new Date(right.createdAt); });
    const rows = [["Actividad", "Detalle", "Fecha y hora"]];
    events.forEach(function (event) {
      const action = ACTION_LABELS[event.action] || ["Actividad"];
      rows.push([action[0], event.detail || "Interacción registrada", formatDateTime(event.createdAt)]);
    });
    const csv = "\uFEFF" + rows.map(function (row) {
      return row.map(function (value) { return '"' + String(value).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mi-historial-campus-colectivo.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Tu historial CSV está listo.");
  }).catch(function () { showToast("No pudimos exportar el historial.", true); });
}

function openComposer() {
  if (el("#composer-dialog").showModal) el("#composer-dialog").showModal();
  else el("#composer-dialog").setAttribute("open", "");
  window.setTimeout(function () { el("#post-content").focus(); }, 20);
}

function closeComposer() {
  const dialog = el("#composer-dialog");
  if (dialog.close) dialog.close();
  else dialog.removeAttribute("open");
}

function clearFeedFilters() {
  el("#search-posts").value = "";
  el("#filter-type").value = "";
  el("#filter-group").value = "";
  el("#filter-tag").value = "";
  state.activeGroup = "";
  renderFeed(false);
}

function attachEvents() {
  el("#register-form").addEventListener("input", updateLivePreview);
  el("#profile-career").addEventListener("change", function () {
    el("#other-career-field").hidden = el("#profile-career").value !== "Otra carrera";
    el("#profile-other-career").required = el("#profile-career").value === "Otra carrera";
    updateLivePreview();
  });
  all("[data-next-step]").forEach(function (button) {
    button.addEventListener("click", function () {
      const currentStep = Number(button.dataset.nextStep) - 1;
      if (validateRegistrationStep(currentStep)) showStep(Number(button.dataset.nextStep));
    });
  });
  all("[data-previous-step]").forEach(function (button) {
    button.addEventListener("click", function () { showStep(Number(button.dataset.previousStep)); });
  });
  el("#register-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    const activeStep = Number(el(".form-step.is-active").dataset.formStep);
    if (activeStep < 3) {
      if (validateRegistrationStep(activeStep)) showStep(activeStep + 1);
      return;
    }
    el("#form-error").textContent = "";
    if (!validateRegistrationStep(1)) { showStep(1); return; }
    if (!validateRegistrationStep(2)) { showStep(2); return; }
    const person = createProfileFromForm();
    await saveRecord("profiles", person);
    await saveRecord("meta", { key: "currentUser", value: person.id });
    state.profile = person;
    el("#register-panel").hidden = true;
    el("#summary-profile").innerHTML = profileMarkup(person);
    el("#welcome-summary").hidden = false;
  });
  el("#enter-campus").addEventListener("click", enterCommunity);
  all("[data-theme-toggle]").forEach(function (button) {
    button.addEventListener("click", function () {
      setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });
  });
  document.addEventListener("click", function (event) {
    const viewLink = event.target.closest("[data-view-link]");
    if (viewLink) {
      event.preventDefault();
      setView(viewLink.dataset.viewLink);
      return;
    }
    const groupButton = event.target.closest("[data-group]");
    if (groupButton) {
      state.activeGroup = groupButton.dataset.group;
      el("#filter-group").value = state.activeGroup;
      setView("feed");
      renderFeed(false);
      return;
    }
    const tagButton = event.target.closest("[data-tag]");
    if (tagButton) {
      el("#filter-tag").value = tagButton.dataset.tag;
      state.activeGroup = "";
      renderFeed(false);
      return;
    }
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    if (actionButton.dataset.action === "like") toggleLike(actionButton.closest("[data-post-id]").dataset.postId);
    if (actionButton.dataset.action === "delete") deletePost(actionButton.closest("[data-post-id]").dataset.postId);
    if (actionButton.dataset.action === "new-post") openComposer();
    if (actionButton.dataset.action === "clear-filters") clearFeedFilters();
  });
  el("#search-posts").addEventListener("input", function () { state.activeGroup = ""; renderFeed(false); });
  ["#filter-type", "#filter-group", "#filter-tag"].forEach(function (selector) {
    el(selector).addEventListener("change", function () {
      state.activeGroup = selector === "#filter-group" ? el("#filter-group").value : "";
      renderFeed(false);
    });
  });
  el("#post-list").addEventListener("submit", function (event) {
    const form = event.target.closest(".comment-form");
    if (!form) return;
    event.preventDefault();
    addComment(form);
  });
  el("#composer-form").addEventListener("submit", function (event) {
    event.preventDefault();
    createPost(event.currentTarget);
  });
  el("#post-content").addEventListener("input", function () {
    el("#post-character-count").textContent = el("#post-content").value.length + " / 700";
    el("#composer-error").textContent = "";
  });
  el("#post-kind").addEventListener("change", function () {
    el("#resource-field").hidden = el("#post-kind").value !== "material";
  });
  el("#open-composer").addEventListener("click", openComposer);
  el("#strip-compose").addEventListener("click", openComposer);
  el("#mobile-compose").addEventListener("click", openComposer);
  el("#close-composer").addEventListener("click", closeComposer);
  el("#cancel-composer").addEventListener("click", closeComposer);
  el("#composer-dialog").addEventListener("click", function (event) {
    if (event.target === el("#composer-dialog")) closeComposer();
  });
  el("#export-history").addEventListener("click", exportHistoryCSV);
  el("#print-history").addEventListener("click", function () { window.print(); });
  el("#clear-examples").addEventListener("click", clearExamples);
  el("#change-profile").addEventListener("click", async function () {
    if (!window.confirm("¿Volver a la pantalla de registro? Tus publicaciones y perfil guardado seguirán en este navegador.")) return;
    await removeRecord("meta", "currentUser");
    state.profile = null;
    el("#app-screen").hidden = true;
    el("#welcome-screen").hidden = false;
    el("#welcome-summary").hidden = true;
    el("#register-panel").hidden = false;
    el("#register-form").reset();
    el("#other-career-field").hidden = true;
    el("#profile-other-career").required = false;
    el("#career-error").textContent = "";
    el("#year-error").textContent = "";
    el("#name-error").textContent = "";
    el("#email-error").textContent = "";
    showStep(1);
    updateLivePreview();
  });
  document.addEventListener("keydown", function (event) {
    const target = event.target;
    const typing = target && (target.matches("input, textarea, select") || target.isContentEditable);
    if (event.key.toLowerCase() === "n" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey && !el("#app-screen").hidden) {
      event.preventDefault();
      openComposer();
    }
    if (event.key === "Escape" && el("#composer-dialog").open) closeComposer();
  });
}

async function startApp() {
  readSavedTheme();
  attachEvents();
  updateLivePreview();
  setWelcomeDate();
  try {
    state.db = await openDatabase();
    await seedExamplesIfNeeded();
    const currentUser = await readRecord("meta", "currentUser");
    if (currentUser && currentUser.value) {
      state.profile = await readRecord("profiles", currentUser.value);
      if (state.profile) await enterCommunity();
    }
  } catch (error) {
    console.error("No se pudo abrir la base de datos local.", error);
    showToast("No se pudo abrir IndexedDB. Prueba este proyecto en un navegador actualizado.", true);
  }
}

startApp();
