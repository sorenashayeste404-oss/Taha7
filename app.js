/**
 * برنامه ۱۰ مدرسه طاها
 * Student + Admin school schedule app
 * Frontend with PHP/MySQL authenticated API
 * Role permissions are enforced server-side
 */

import { DAYS, DAY_ORDER_MAP } from "./school-config.js";
const API = "./api";
const GROUPS = ["دهم","یازدهم","دوازدهم"].flatMap(g => ["تجربی","ریاضی","انسانی"].flatMap(f => ["1","2"].map(b => `${g} ${f} شعبه ${b}`)));
async function api(path, options={}) {
  const headers = {"Content-Type":"application/json", ...(options.headers||{})};
  if (state.csrf) headers["X-CSRF-Token"] = state.csrf;
  const response = await fetch(`${API}/${path}`, {credentials:"same-origin", ...options, headers});
  let data={}; try { data=await response.json(); } catch {}
  if (!response.ok) { const e=new Error(data.error||"درخواست انجام نشد."); e.status=response.status; throw e; }
  return data;
}

/* ========== State ========== */
const state = {
  group:null, field:null, grade:"دهم", branch:null, user:null, csrf:"", allowedGroups:[],
  lessons:[], tasks:[], currentView:"home", currentDay:"شنبه", taskFilter:"همه",
  adminTab:"dashboard", adminLessonFilter:{group:GROUPS[0],day:"شنبه"}, adminTaskFilter:{group:GROUPS[0],day:"همه"},
  editingLessonId:null, editingTaskId:null, isOnline:navigator.onLine, isAdmin:false
};

/* ========== DOM Helpers ========== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

function showView(viewId) {
  state.currentView = viewId;
  $$("#screen-student .view").forEach((v) => v.classList.remove("active"));
  const el = document.getElementById("view-" + viewId);
  if (el) el.classList.add("active");

  $$(".nav-item").forEach((n) => {
    n.classList.toggle("active", n.dataset.view === viewId);
  });
}

function showAdminView(tabId) {
  state.adminTab = tabId;
  $$("#screen-admin .admin-view").forEach((v) => v.classList.remove("active"));
  const el = document.getElementById("admin-" + tabId);
  if (el) el.classList.add("active");

  $$(".admin-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabId);
  });
}

function showToast(message, type = "info") {
  const container = $("#toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

function hideLoading() {
  const el = $("#loading-overlay");
  if (el) {
    el.classList.add("fade-out");
    setTimeout(() => el.classList.add("hidden"), 350);
  }
}

function parseTimeOrder(timeStr) {
  // "08:00 - 09:30" → minutes from midnight of start time
  if (!timeStr) return 0;
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function getTodayName() {
  // JS: 0=Sun ... 6=Sat. Iranian week starts Saturday.
  const map = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
  return map[new Date().getDay()];
}

function friendlyError(err) {
  if (!err) return "خطای ناشناخته رخ داد.";
  const code = err.code || "";
  if (code === "permission-denied" || code.includes("permission")) {
    return "دسترسی مجاز نیست.";
  }
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
    return "ایمیل یا رمز عبور اشتباه است.";
  }
  if (code === "auth/user-not-found") {
    return "کاربری با این ایمیل یافت نشد.";
  }
  if (code === "auth/too-many-requests") {
    return "تعداد تلاش‌ها زیاد است. کمی صبر کنید.";
  }
  if (code === "auth/invalid-email") {
    return "فرمت ایمیل نامعتبر است.";
  }
  if (code === "unavailable" || !navigator.onLine) {
    return "اتصال اینترنت برقرار نیست.";
  }
  return err.message || "خطایی رخ داد. دوباره تلاش کنید.";
}

/* ========== Authenticated data loading ========== */
async function subscribeData() {
  try {
    const data=await api("data.php");
    state.lessons=data.lessons||[]; state.tasks=data.tasks||[];
    state.allowedGroups=data.groups||[];
    if(state.user?.role==="student") state.group=`${state.user.grade} ${state.user.field_name} شعبه ${state.user.branch}`;
    renderAllStudent();
  } catch(err) { showToast(friendlyError(err),"error"); if(err.status===401) logoutToLogin(); }
}

/* ========== Student Render ========== */
function renderAllStudent() {
  updateHeader();
  renderHome();
  renderSchedule();
  renderTasks();
  renderSettings();
}

function updateHeader() {
  const title = $("#header-group");
  if (title) title.textContent = state.group || "—";

  const badge = $("#sync-badge");
  if (badge) {
    badge.classList.toggle("offline", !state.isOnline);
    badge.querySelector("span:last-child").textContent = state.isOnline
      ? "آنلاین"
      : "آفلاین";
  }
}

function renderHome() {
  const container = $("#home-content");
  if (!container) return;

  const today = getTodayName();
  const todayLessons = state.lessons.filter((l) => l.day === today);
  const todayTasks = state.tasks.filter((t) => t.day === today);

  let html = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-num">${todayLessons.length}</div>
        <div class="stat-label">درس امروز</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${todayTasks.length}</div>
        <div class="stat-label">کار امروز</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${state.lessons.length}</div>
        <div class="stat-label">کل دروس</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${state.tasks.length}</div>
        <div class="stat-label">کل کارها</div>
      </div>
    </div>
  `;

  // Today's schedule summary
  html += `<div class="section-title"><span class="icon">📅</span> برنامه امروز (${today})</div>`;

  if (todayLessons.length === 0) {
    html += `
      <div class="empty-state" style="padding:1.5rem">
        <p>برای امروز درسی ثبت نشده است.</p>
      </div>`;
  } else {
    todayLessons.forEach((l) => {
      html += `
        <div class="today-lesson-card">
          <div class="time-badge">${esc(l.time || "")}</div>
          <div class="lesson-info">
            <h4>${esc(l.name || "")}</h4>
            <span>${esc(l.teacher || "—")}</span>
          </div>
        </div>`;
    });
  }

  // Today's tasks
  if (todayTasks.length > 0) {
    html += `<div class="section-title mt-3"><span class="icon">✅</span> کارهای امروز</div>`;
    todayTasks.forEach((t) => {
      html += `
        <div class="task-card">
          <h3>${esc(t.title || "")}</h3>
          <div class="task-desc">${esc(t.desc || "")}</div>
        </div>`;
    });
  }

  container.innerHTML = html;
}

function renderSchedule() {
  const tabsEl = $("#day-tabs");
  const listEl = $("#schedule-list");
  if (!tabsEl || !listEl) return;

  // Day tabs
  tabsEl.innerHTML = DAYS.map(
    (d) =>
      `<button class="day-tab ${d.name === state.currentDay ? "active" : ""}" data-day="${d.name}">${d.name}</button>`
  ).join("");

  tabsEl.querySelectorAll(".day-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.currentDay = btn.dataset.day;
      renderSchedule();
    });
  });

  // Lessons for selected day
  const dayLessons = state.lessons
    .filter((l) => l.day === state.currentDay)
    .sort((a, b) => (a.timeOrder || 0) - (b.timeOrder || 0));

  if (dayLessons.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <p>هنوز برنامه‌ای برای این کلاس ثبت نشده.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = dayLessons
    .map(
      (l) => `
    <div class="lesson-card">
      <div class="lesson-time">${esc(l.time || "")}</div>
      <div class="lesson-details">
        <h3>${esc(l.name || "")}</h3>
        <div class="teacher">${esc(l.teacher || "—")}</div>
      </div>
    </div>`
    )
    .join("");
}

function renderTasks() {
  const filtersEl = $("#task-filters");
  const listEl = $("#tasks-list");
  if (!filtersEl || !listEl) return;

  const filters = ["همه", ...DAYS.map((d) => d.name)];
  filtersEl.innerHTML = filters
    .map(
      (f) =>
        `<button class="filter-tab ${f === state.taskFilter ? "active" : ""}" data-filter="${f}">${f}</button>`
    )
    .join("");

  filtersEl.querySelectorAll(".filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.taskFilter = btn.dataset.filter;
      renderTasks();
    });
  });

  let filtered = state.tasks;
  if (state.taskFilter !== "همه") {
    filtered = state.tasks.filter((t) => t.day === state.taskFilter);
  }

  filtered = [...filtered].sort((a, b) => (a.dayOrder || 0) - (b.dayOrder || 0));

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>فعلاً کاری برای این کلاس ثبت نشده.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (t) => `
    <div class="task-card">
      <span class="task-day">${esc(t.day || "")}</span>
      <h3>${esc(t.title || "")}</h3>
      <div class="task-desc">${esc(t.desc || "")}</div>
    </div>`
    )
    .join("");
}

function renderSettings() {
  const el = $("#settings-group"); if (el) el.textContent = state.group || "—";
  const name=$("#account-full-name"); if(name) name.textContent=state.user?.full_name||"—";
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

/* ========== Login and role routing ========== */
function initClassSelect() { /* Class is assigned to the account; no public class picker. */ }
function startStudentApp() {
  state.group=state.user?.role==="student" ? `${state.user.grade} ${state.user.field_name} شعبه ${state.user.branch}` : null;
  showScreen("screen-student"); showView("home"); subscribeData();
}
function routeUser() {
  if(!state.user) { showScreen("screen-admin-login"); return; }
  if(state.user.role==="student") startStudentApp();
  else { showScreen("screen-admin"); showAdminView("dashboard"); const title=$("#admin-panel-title");if(title)title.textContent=state.user.role==="admin"?"پنل مدیریت":"پنل معلم";loadAdminData(); }
  startRefreshLoop();
  if(state.user.must_change_password) { showToast("برای امنیت، ابتدا رمز اولیه را تغییر دهید.","warning"); if(state.user.role==="student")showView("settings"); }
}
function initAdminLogin() {
  const form=$("#admin-login-form");
  form.addEventListener("submit",async e=>{
    e.preventDefault(); const btn=$("#btn-admin-login"); btn.disabled=true; btn.textContent="در حال ورود...";
    try { const result=await api("auth.php?action=login",{method:"POST",body:JSON.stringify({login:$("#login-name").value.trim(),password:$("#admin-password").value})}); state.user=result.user;state.csrf=result.csrf;$("#admin-password").value="";$("#login-name").value="";routeUser();showToast("ورود موفق بود.","success"); }
    catch(err){showToast(friendlyError(err),"error");}
    finally{btn.disabled=false;btn.textContent="ورود";}
  });
}
let allAdminLessons=[]; let allAdminTasks=[]; let dataRefreshTimer=null;
function startRefreshLoop(){ if(dataRefreshTimer)clearInterval(dataRefreshTimer); dataRefreshTimer=setInterval(()=>{if(!state.user||!navigator.onLine)return;if(state.user.role==="student")subscribeData();else if($("#screen-admin")?.classList.contains("active"))refreshAdminData();},30000); }
async function loadAdminData() {
  try {
    const data=await api("data.php"); allAdminLessons=data.lessons||[]; allAdminTasks=data.tasks||[]; state.allowedGroups=data.groups||[];
    if(!state.allowedGroups.length) state.allowedGroups=state.user.role==="admin"?GROUPS:[];
    populateSelects();
    const first=state.allowedGroups[0]||GROUPS[0];
    state.adminLessonFilter.group=first; state.adminTaskFilter.group=first;
    ["admin-lesson-group","admin-task-group","lesson-group","task-group"].forEach(id=>{const el=$("#"+id);if(el)el.value=first;});
    renderAdminLessons();renderAdminTasks();renderAdminDashboard();
    const usersTab=$("[data-tab='users']"); if(usersTab) usersTab.hidden=state.user.role!=="admin";
    if(state.user.role==="admin") loadUsers();
    else { $("#btn-add-lesson").hidden=false; $("#btn-add-task").hidden=false; }
  } catch(err){showToast(friendlyError(err),"error");}
}
async function refreshAdminData(){try{const data=await api("data.php");allAdminLessons=data.lessons||[];allAdminTasks=data.tasks||[];state.allowedGroups=data.groups||state.allowedGroups;renderAdminLessons();renderAdminTasks();renderAdminDashboard();}catch(err){if(err.status===401)logoutToLogin();}}
async function logoutToLogin(){
  if(dataRefreshTimer){clearInterval(dataRefreshTimer);dataRefreshTimer=null;}
  try{if(state.csrf)await api("auth.php?action=logout",{method:"POST",body:JSON.stringify({csrf:state.csrf})});}catch{}
  state.user=null;state.csrf="";state.group=null;state.lessons=[];state.tasks=[];showScreen("screen-admin-login");
}

function renderAdminDashboard() {
  const el = $("#admin-dashboard-content");
  if (!el) return;

  const lessonCount = allAdminLessons.length;
  const taskCount = allAdminTasks.length;
  const groupsWithData = new Set([
    ...allAdminLessons.map((l) => l.group),
    ...allAdminTasks.map((t) => t.group)
  ]);

  el.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:1fr 1fr">
      <div class="stat-card">
        <div class="stat-num">${lessonCount}</div>
        <div class="stat-label">کل دروس</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${taskCount}</div>
        <div class="stat-label">کل کارها</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${groupsWithData.size}</div>
        <div class="stat-label">کلاس‌های فعال</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${GROUPS.length}</div>
        <div class="stat-label">کل کلاس‌ها</div>
      </div>
    </div>
    <div class="card mt-3">
      <div class="card-title">راهنمای سریع</div>
      <p class="text-secondary text-sm mt-1">
        از تب «برنامه کلاسی» برای افزودن، ویرایش یا حذف دروس استفاده کنید.
        از تب «کارهای روزانه» برای مدیریت تکالیف و کارها استفاده کنید.
      </p>
    </div>
  `;
}

function renderAdminLessons() {
  const listEl = $("#admin-lessons-list");
  if (!listEl) return;

  const { group, day } = state.adminLessonFilter;
  let filtered = allAdminLessons.filter((l) => l.group === group);
  if (day !== "همه") filtered = filtered.filter((l) => l.day === day);
  filtered.sort(
    (a, b) =>
      (a.dayOrder || 0) - (b.dayOrder || 0) ||
      (a.timeOrder || 0) - (b.timeOrder || 0)
  );

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <p>درسی برای این فیلتر ثبت نشده.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (l) => `
    <div class="list-item">
      <div class="item-info">
        <h4>${esc(l.name || "")}</h4>
        <div class="item-meta">
          ${esc(l.day || "")} · ${esc(l.time || "")}<br>
          ${esc(l.teacher || "—")} · ${esc(l.group || "")}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-secondary btn-sm" data-edit-lesson="${l.id}">ویرایش</button>
        <button class="btn btn-danger btn-sm" data-del-lesson="${l.id}">حذف</button>
      </div>
    </div>`
    )
    .join("");

  listEl.querySelectorAll("[data-edit-lesson]").forEach((btn) => {
    btn.addEventListener("click", () => openLessonModal(btn.dataset.editLesson));
  });
  listEl.querySelectorAll("[data-del-lesson]").forEach((btn) => {
    btn.addEventListener("click", () => confirmDelete("lesson", btn.dataset.delLesson));
  });
}

function renderAdminTasks() {
  const listEl = $("#admin-tasks-list");
  if (!listEl) return;

  const { group, day } = state.adminTaskFilter;
  let filtered = allAdminTasks.filter((t) => t.group === group);
  if (day !== "همه") filtered = filtered.filter((t) => t.day === day);
  filtered.sort((a, b) => (a.dayOrder || 0) - (b.dayOrder || 0));

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>کاری برای این فیلتر ثبت نشده.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (t) => `
    <div class="list-item">
      <div class="item-info">
        <h4>${esc(t.title || "")}</h4>
        <div class="item-meta">
          ${esc(t.day || "")} · ${esc(t.group || "")}<br>
          ${esc(t.desc || "")}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-secondary btn-sm" data-edit-task="${t.id}">ویرایش</button>
        <button class="btn btn-danger btn-sm" data-del-task="${t.id}">حذف</button>
      </div>
    </div>`
    )
    .join("");

  listEl.querySelectorAll("[data-edit-task]").forEach((btn) => {
    btn.addEventListener("click", () => openTaskModal(btn.dataset.editTask));
  });
  listEl.querySelectorAll("[data-del-task]").forEach((btn) => {
    btn.addEventListener("click", () => confirmDelete("task", btn.dataset.delTask));
  });
}

/* ========== Admin Modals ========== */
function openLessonModal(id = null) {
  state.editingLessonId = id;
  const modal = $("#lesson-modal");
  const title = $("#lesson-modal-title");
  title.textContent = id ? "ویرایش درس" : "افزودن درس";

  if (id) {
    const lesson = allAdminLessons.find((l) => l.id === id);
    if (lesson) {
      $("#lesson-group").value = lesson.group || "";
      $("#lesson-day").value = lesson.day || "";
      $("#lesson-time").value = lesson.time || "";
      $("#lesson-name").value = lesson.name || "";
      $("#lesson-teacher").value = lesson.teacher || "";
    }
  } else {
    $("#lesson-group").value = state.adminLessonFilter.group;
    $("#lesson-day").value = state.adminLessonFilter.day === "همه" ? "شنبه" : state.adminLessonFilter.day;
    $("#lesson-time").value = "";
    $("#lesson-name").value = "";
    $("#lesson-teacher").value = "";
  }

  modal.classList.add("open");
}

function closeLessonModal() {
  $("#lesson-modal").classList.remove("open");
  state.editingLessonId = null;
}

function openTaskModal(id = null) {
  state.editingTaskId = id;
  const modal = $("#task-modal");
  const title = $("#task-modal-title");
  title.textContent = id ? "ویرایش کار" : "افزودن کار";

  if (id) {
    const task = allAdminTasks.find((t) => t.id === id);
    if (task) {
      $("#task-group").value = task.group || "";
      $("#task-day").value = task.day || "";
      $("#task-title").value = task.title || "";
      $("#task-desc").value = task.desc || "";
    }
  } else {
    $("#task-group").value = state.adminTaskFilter.group;
    $("#task-day").value = state.adminTaskFilter.day === "همه" ? "شنبه" : state.adminTaskFilter.day;
    $("#task-title").value = "";
    $("#task-desc").value = "";
  }

  modal.classList.add("open");
}

function closeTaskModal() {
  $("#task-modal").classList.remove("open");
  state.editingTaskId = null;
}

async function saveLesson(e) {
 e.preventDefault(); const group=$("#lesson-group").value,day=$("#lesson-day").value,time=$("#lesson-time").value.trim(),name=$("#lesson-name").value.trim(),teacher=$("#lesson-teacher").value.trim();
 if(!group||!day||!time||!name){showToast("فیلدهای ضروری را کامل کنید.","warning");return;}
 const btn=$("#btn-save-lesson");btn.disabled=true;btn.textContent="در حال ذخیره...";
 const data={group,day,dayOrder:DAY_ORDER_MAP[day]||0,time,timeOrder:parseTimeOrder(time),name,teacher,id:state.editingLessonId};
 try{await api(`data.php?kind=lessons`,{method:state.editingLessonId?"PUT":"POST",body:JSON.stringify({...data,csrf:state.csrf})});showToast("درس ذخیره شد.","success");closeLessonModal();await refreshAdminData();}
 catch(err){showToast(friendlyError(err),"error");}finally{btn.disabled=false;btn.textContent="ذخیره درس";}
}
async function saveTask(e) {
 e.preventDefault();const group=$("#task-group").value,day=$("#task-day").value,title=$("#task-title").value.trim(),desc=$("#task-desc").value.trim();
 if(!group||!day||!title){showToast("فیلدهای ضروری را کامل کنید.","warning");return;}
 const btn=$("#btn-save-task");btn.disabled=true;btn.textContent="در حال ذخیره...";
 const data={group,day,dayOrder:DAY_ORDER_MAP[day]||0,title,desc,id:state.editingTaskId};
 try{await api(`data.php?kind=tasks`,{method:state.editingTaskId?"PUT":"POST",body:JSON.stringify({...data,csrf:state.csrf})});showToast("کار ذخیره شد.","success");closeTaskModal();await refreshAdminData();}
 catch(err){showToast(friendlyError(err),"error");}finally{btn.disabled=false;btn.textContent="ذخیره کار";}
}

function confirmDelete(type, id) {
  const overlay = $("#confirm-modal");
  const msg = $("#confirm-message");
  msg.textContent =
    type === "lesson"
      ? "آیا از حذف این درس مطمئن هستید؟"
      : "آیا از حذف این کار مطمئن هستید؟";

  overlay.classList.add("open");

  const yesBtn = $("#confirm-yes");
  const noBtn = $("#confirm-no");

  const cleanup = () => {
    overlay.classList.remove("open");
    yesBtn.replaceWith(yesBtn.cloneNode(true));
    noBtn.replaceWith(noBtn.cloneNode(true));
  };

  $("#confirm-yes").onclick = async () => {
    cleanup();
    try {
      await api(`data.php?kind=${type === "lesson" ? "lessons" : "tasks"}`,{method:"DELETE",body:JSON.stringify({id:Number(id),csrf:state.csrf})});
      showToast("با موفقیت حذف شد.", "success"); await refreshAdminData();
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
  };

  $("#confirm-no").onclick = cleanup;
}

/* ========== Main administrator: user management ========== */
function classSelectOptions() {
 return `<option value="">انتخاب پایه</option>` + ["دهم","یازدهم","دوازدهم"].map(x=>`<option>${x}</option>`).join("");
}
async function loadUsers(){
 const host=$("#users-management"); if(!host||state.user?.role!=="admin")return;
 host.innerHTML=`
 <div class="card user-create-card"><h3>ساخت حساب جدید</h3>
 <div class="form-group"><label class="form-label">نوع حساب</label><select id="new-user-role" class="form-select"><option value="student">دانش‌آموز</option><option value="teacher">معلم درس</option></select></div>
 <div id="new-student-fields">
  <div class="form-grid"><div class="form-group"><label class="form-label">پایه</label><select id="new-student-grade" class="form-select">${classSelectOptions()}</select></div><div class="form-group"><label class="form-label">رشته</label><select id="new-student-field" class="form-select"><option>تجربی</option><option>ریاضی</option><option>انسانی</option></select></div><div class="form-group"><label class="form-label">شعبه</label><select id="new-student-branch" class="form-select"><option value="1">۱</option><option value="2">۲</option></select></div></div>
  <div class="form-group"><label class="form-label">فهرست دانش‌آموزان (هر نام در یک خط)</label><textarea id="roster-names" class="form-textarea" rows="5" placeholder="نام و نام خانوادگی دانش‌آموز اول&#10;نام و نام خانوادگی دانش‌آموز دوم"></textarea></div>
  <p class="text-secondary text-sm">برای هر دانش‌آموز رمز اولیهٔ جداگانه ساخته می‌شود و نام کاربری همان نام کامل است.</p>
 </div>
 <div id="new-teacher-fields" hidden>
  <div class="form-group"><label class="form-label">نام و نام خانوادگی معلم</label><input id="new-teacher-name" class="form-input" placeholder="نام کامل معلم"></div>
  <div class="form-group"><label class="form-label">رمز اولیه (حداقل ۱۰ نویسه)</label><input id="new-teacher-password" type="text" class="form-input" minlength="10" placeholder="رمز اولیه"></div>
  <h4>محدوده‌های تدریس</h4><div id="teacher-scopes"></div><button type="button" id="add-teacher-scope" class="btn btn-secondary btn-sm">+ افزودن محدوده دیگر</button>
 </div>
 <button type="button" id="create-user-btn" class="btn btn-primary btn-block">ساخت حساب</button><div id="new-user-result" class="credentials-result" hidden></div>
 </div><div class="card"><h3>حساب‌های ساخته‌شده</h3><div id="users-list">در حال بارگذاری...</div></div>`;
 const addScope=()=>{const wrap=document.createElement("div");wrap.className="scope-row";wrap.innerHTML=`<select class="form-select scope-grade">${classSelectOptions()}</select><select class="form-select scope-field"><option>تجربی</option><option>ریاضی</option><option>انسانی</option></select><select class="form-select scope-branch"><option value="1">شعبه ۱</option><option value="2">شعبه ۲</option></select><input class="form-input scope-subject" placeholder="نام درس"><button type="button" class="btn btn-danger btn-sm remove-scope">حذف</button>`;wrap.querySelector(".remove-scope").onclick=()=>wrap.remove();$("#teacher-scopes").appendChild(wrap);};
 addScope();
 $("#add-teacher-scope").onclick=addScope;
 $("#new-user-role").onchange=e=>{$("#new-student-fields").hidden=e.target.value!=="student";$("#new-teacher-fields").hidden=e.target.value!=="teacher";};
 $("#create-user-btn").onclick=async()=>{
  const role=$("#new-user-role").value, result=$("#new-user-result"),btn=$("#create-user-btn");btn.disabled=true;
  try{
   let payload;
   if(role==="student"){
    const names=$("#roster-names").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(!names.length)throw new Error("نام دانش‌آموزان را وارد کنید.");
    payload={role,names,grade:$("#new-student-grade").value,field_name:$("#new-student-field").value,branch:$("#new-student-branch").value,csrf:state.csrf};
   } else {
    const scopes=[...document.querySelectorAll(".scope-row")].map(r=>({grade:r.querySelector(".scope-grade").value,field_name:r.querySelector(".scope-field").value,branch:r.querySelector(".scope-branch").value,subject_name:r.querySelector(".scope-subject").value.trim()}));
    payload={role,full_name:$("#new-teacher-name").value.trim(),password:$("#new-teacher-password").value,scopes,csrf:state.csrf};
   }
   const data=await api("users.php",{method:"POST",body:JSON.stringify(payload)});
   const creds=data.created||[{full_name:data.full_name,username:data.username||data.full_name,initial_password:data.initial_password}];
   if(role==="student")$("#roster-names").value="";else {$("#new-teacher-name").value="";$("#new-teacher-password").value="";}
   await loadUsers();
   const freshResult=$("#new-user-result"); freshResult.hidden=false;freshResult.innerHTML=`<h4>اطلاعات ورود — همین حالا ذخیره کنید</h4><div class="credentials-table">${creds.map(c=>`<div><b>${esc(c.full_name)}</b><span>${role==="teacher"?"شناسه ورود: همان نام کامل معلم":"نام کاربری: "+esc(c.username||c.full_name)}</span><span>رمز اولیه: <code>${esc(c.initial_password)}</code></span></div>`).join("")}</div><button type="button" class="btn btn-secondary btn-sm" id="copy-credentials">کپی اطلاعات</button>`;
   $("#copy-credentials").onclick=()=>navigator.clipboard?.writeText(creds.map(c=>`${c.full_name}\nنام ورود: ${c.username||c.full_name}\nرمز: ${c.initial_password}`).join("\n\n"));
   showToast("حساب با موفقیت ساخته شد.","success");
  }catch(err){showToast(friendlyError(err),"error");}finally{btn.disabled=false;}
 };
 try{
  const data=await api("users.php");const list=$("#users-list");
  if(!data.users.length){list.innerHTML='<p class="text-secondary">هنوز حسابی ساخته نشده است.</p>';return;}
  list.innerHTML=data.users.map(u=>`<div class="user-row"><div><b>${esc(u.full_name)}</b><div class="item-meta">${u.role==="teacher"?"معلم":"دانش‌آموز"} · ${u.role==="student"?esc(`${u.grade} ${u.field_name} شعبه ${u.branch}`):u.scopes.map(x=>esc(`${x.grade} ${x.field_name} شعبه ${x.branch} — ${x.subject_name}`)).join("، ")}</div><small>${u.active?"فعال":"غیرفعال"}</small></div><div class="item-actions"><button class="btn btn-secondary btn-sm" data-reset-user="${u.id}">بازنشانی رمز</button><button class="btn btn-outline btn-sm" data-toggle-user="${u.id}" data-active="${u.active?1:0}">${u.active?"غیرفعال‌کردن":"فعال‌کردن"}</button></div></div>`).join("");
  list.querySelectorAll("[data-reset-user]").forEach(btn=>btn.onclick=async()=>{if(!confirm("رمز این حساب بازنشانی شود؟"))return;try{const r=await api("users.php",{method:"PATCH",body:JSON.stringify({id:Number(btn.dataset.resetUser),reset_password:true,csrf:state.csrf})});alert(`رمز اولیه جدید: ${r.initial_password}\nاین رمز را به کاربر بدهید.`);}catch(e){showToast(friendlyError(e),"error");}});
  list.querySelectorAll("[data-toggle-user]").forEach(btn=>btn.onclick=async()=>{try{await api("users.php",{method:"PATCH",body:JSON.stringify({id:Number(btn.dataset.toggleUser),active:btn.dataset.active!=="1",csrf:state.csrf})});await loadUsers();}catch(e){showToast(friendlyError(e),"error");}});
 }catch(err){$("#users-list").textContent=friendlyError(err);}
}

/* ========== Populate Select Options ========== */
function populateSelects() {
  const groupOptions = (state.allowedGroups.length ? state.allowedGroups : (state.user?.role === "admin" ? GROUPS : [])).map(
    (g) => `<option value="${g}">${g}</option>`
  ).join("");
  const dayOptions = DAYS.map(
    (d) => `<option value="${d.name}">${d.name}</option>`
  ).join("");
  const dayOptionsAll =
    `<option value="همه">همه روزها</option>` + dayOptions;

  // Admin filter selects
  const alGroup = $("#admin-lesson-group");
  const alDay = $("#admin-lesson-day");
  const atGroup = $("#admin-task-group");
  const atDay = $("#admin-task-day");

  if (alGroup) alGroup.innerHTML = groupOptions;
  if (alDay) alDay.innerHTML = dayOptionsAll;
  if (atGroup) atGroup.innerHTML = groupOptions;
  if (atDay) atDay.innerHTML = dayOptionsAll;

  // Modal selects
  const lg = $("#lesson-group");
  const ld = $("#lesson-day");
  const tg = $("#task-group");
  const td = $("#task-day");

  if (lg) lg.innerHTML = groupOptions;
  if (ld) ld.innerHTML = dayOptions;
  if (tg) tg.innerHTML = groupOptions;
  if (td) td.innerHTML = dayOptions;
}

/* ========== Event Bindings ========== */
function bindEvents() {
  // Bottom nav
  $$(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      showView(item.dataset.view);
    });
  });

  // Secondary navigation drawer
  const drawer = $("#side-drawer");
  const backdrop = $("#drawer-backdrop");
  const openDrawer = () => {
    drawer?.classList.add("open");
    backdrop?.classList.add("open");
    $("#btn-menu")?.setAttribute("aria-expanded", "true");
    drawer?.setAttribute("aria-hidden", "false");
  };
  const closeDrawer = () => {
    drawer?.classList.remove("open");
    backdrop?.classList.remove("open");
    $("#btn-menu")?.setAttribute("aria-expanded", "false");
    drawer?.setAttribute("aria-hidden", "true");
  };
  $("#btn-menu")?.addEventListener("click", openDrawer);
  $("#btn-close-menu")?.addEventListener("click", closeDrawer);
  backdrop?.addEventListener("click", closeDrawer);
  $$("[data-drawer-view]").forEach((item) => item.addEventListener("click", () => {
    showView(item.dataset.drawerView);
    closeDrawer();
  }));

  // Change password is available in the account settings section. Class is fixed by account assignment.

  // Login screen is the only unauthenticated entry point.
  $("#change-password-form")?.addEventListener("submit",async e=>{e.preventDefault();try{await api("auth.php?action=change-password",{method:"POST",body:JSON.stringify({old_password:$("#old-password").value,new_password:$("#new-password").value,csrf:state.csrf})});$("#change-password-form").reset();if(state.user)state.user.must_change_password=false;showToast("رمز عبور تغییر کرد.","success");}catch(err){showToast(friendlyError(err),"error");}});
  $("#btn-student-logout")?.addEventListener("click",logoutToLogin);
  $("#admin-change-password-form")?.addEventListener("submit",async e=>{e.preventDefault();try{await api("auth.php?action=change-password",{method:"POST",body:JSON.stringify({old_password:$("#admin-old-password").value,new_password:$("#admin-new-password").value,csrf:state.csrf})});$("#admin-change-password-form").reset();if(state.user)state.user.must_change_password=false;showToast("رمز عبور تغییر کرد.","success");}catch(err){showToast(friendlyError(err),"error");}});

  // Admin tabs
  $$(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      showAdminView(tab.dataset.tab);
      if(tab.dataset.tab==="users") loadUsers();
    });
  });

  // Admin logout
  $("#btn-admin-logout")?.addEventListener("click", logoutToLogin);

  // Admin filters
  $("#admin-lesson-group")?.addEventListener("change", (e) => {
    state.adminLessonFilter.group = e.target.value;
    renderAdminLessons();
  });
  $("#admin-lesson-day")?.addEventListener("change", (e) => {
    state.adminLessonFilter.day = e.target.value;
    renderAdminLessons();
  });
  $("#admin-task-group")?.addEventListener("change", (e) => {
    state.adminTaskFilter.group = e.target.value;
    renderAdminTasks();
  });
  $("#admin-task-day")?.addEventListener("change", (e) => {
    state.adminTaskFilter.day = e.target.value;
    renderAdminTasks();
  });

  // Add buttons
  $("#btn-add-lesson")?.addEventListener("click", () => openLessonModal());
  $("#btn-add-task")?.addEventListener("click", () => openTaskModal());

  // Forms
  $("#lesson-form")?.addEventListener("submit", saveLesson);
  $("#task-form")?.addEventListener("submit", saveTask);

  // Modal closes
  $("#lesson-modal-close")?.addEventListener("click", closeLessonModal);
  $("#task-modal-close")?.addEventListener("click", closeTaskModal);
  $("#lesson-modal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeLessonModal();
  });
  $("#task-modal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeTaskModal();
  });

  // Online/offline
  window.addEventListener("online", () => {
    state.isOnline = true;
    updateHeader();
    showToast("اتصال برقرار شد.", "success");
  });
  window.addEventListener("offline", () => {
    state.isOnline = false;
    updateHeader();
    showToast("اتصال قطع شد؛ دریافت و ذخیره داده‌ها تا اتصال مجدد متوقف است.", "warning");
  });
  window.addEventListener("online",()=>{if(state.user){if(state.user.role==="student")subscribeData();else refreshAdminData();}});
}

/* ========== Init ========== */
function init() {
  populateSelects();
  initClassSelect();
  initAdminLogin();
  bindEvents();

  api("auth.php?action=me").then(result=>{state.user=result.user;state.csrf=result.csrf;routeUser();}).catch(()=>showScreen("screen-admin-login")).finally(hideLoading);
}

// Start
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
