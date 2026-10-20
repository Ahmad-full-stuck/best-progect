/* ===== نُور — طبقة البيانات (localStorage) =====
   تعمل بالكامل داخل المتصفح: لا خادم، لا أنترنت، لا مفاتيح خارجية.
   كل منطق النظام (المهام، المشاريع، المؤقت، الإحصائيات) محمول هنا. */
(function (global) {
  'use strict';

  var KEY = 'noor_db_v1';

  /* الأكسنت الافتراضي — يتطابق مع --accent في CSS وNOOR_ACCENT في app.js */
  var DEFAULT_COLOR = '#B85C38';

  var SENTENCES = [
    'لم يبدأ شيء بعد — اشتغل الآن ولو عشر دقائق.',
    'البداية الأصعب… أشعل أول جلسة.',
    'خطواتك الأولى تحركت — استمر.',
    'الأسبوع في مهده — لا تهمله.',
    'جلسات قليلة… اجعلها تتضاعف.',
    'أسبوع متقطع — عُد إلى الطريق.',
    'تحرّك أكثر، إنجازك ما زال يتشكل.',
    'بداية جيدة… لا تتوقف هنا.',
    'الأسبوع بدأ ينبض بالعمل.',
    'تتقدم بشكل ملحوظ — ثبّت قدمك.',
    'أنصاف الطريق… ادفع للأمام.',
    'مستوى جيد — لكن القمة أعلى.',
    'عمل واضح ومستمر — رائع.',
    'أسبوع جيد، امنحه دفعة أخيرة.',
    'أداء لائق… استثمر باقي الأسبوع.',
    'نشاط ممتاز — استمر بثبات.',
    'أسبوع نشيط ومتوازن.',
    'أسبوع قوي جداً — أنت تصنع عادة.',
    'أسبوع نشيط جداً.',
    'أسبوع نشيط جداً جداً.',
    'أسبوع نشيط جداً جداً جداً.',
    'قمة الانضباط — لا تكسر السلسلة.',
    'إنجاز استثنائي — أنت أسطورة تركيز.',
    'أسبوع أسطوري — افتخر بنفسك.',
    'مستوى منقطع النظير — أنت قدوة.'
  ];

  var DEFAULTS = {
    daily_threshold: '50',
    reward_threshold: '80',
    weekly_target_min: '1200',
    daily_target_min: '180',
    pomodoro_min: '25',
    short_break_min: '5',
    long_break_min: '15',
    cycles_per_long: '4',
    sentences: JSON.stringify(SENTENCES),
    life_start: '',
    year_weeks: '52',
    who_am_i: '',
    vision: '',
    values: '',
    plan_years: '20',
    rest_day_every: '0',
    timer_mode: 'pomodoro',
    timer_focus_min: '25',
    timer_alarm_time: '07:00',
    timer_project_id: '',
    timer_project_sel: '',
    freeze_start: '',
    freeze_days: '0'
  };

  var WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  /* ===== أدوات التواريخ ===== */
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseDay(s) {
    var p = String(s).split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]);
  }
  function dayDiff(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }
  function addDays(s, n) {
    var d = new Date(parseDay(s) + n * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function weekdayOf(s) { return new Date(parseDay(s)).getUTCDay(); }
  function weekStart(s) { return addDays(s, -((weekdayOf(s) + 6) % 7)); }
  function nowStamp() { return new Date().toISOString(); }

  /* ===== التقويم السنوي: السنة = عدد محدد من الأسابيع ===== */
  function yearWeeks() { return Math.max(1, Math.round(num(db.settings.year_weeks, 52))); }
  function yearLen() { return yearWeeks() * 7; }
  function lifeStart() { return db.settings.life_start || todayStr(); }
  function hasLifePlan() { return !!db.settings.life_start; }

  /* ===== وضع التأسيس (الجمود): فترة يُملأ فيها النظام دون احتساب أيامها ضمن التتبع ===== */
  function freezeInfo() {
    var s = db.settings;
    var fs = s.freeze_start, fd = Math.round(num(s.freeze_days, 0));
    if (!fs || fd <= 0) return null;
    return { start: fs, days: fd, end: addDays(fs, fd - 1) };
  }
  function inFreeze(date) {
    var f = freezeInfo();
    if (!f) return false;
    return dayDiff(f.start, date) >= 0 && dayDiff(date, f.end) >= 0;
  }
  function freezeRemaining(date) {
    var f = freezeInfo();
    if (!f) return 0;
    return Math.max(0, dayDiff(date, f.end) + 1);
  }
  /* بداية الخطة الفعّالة: أثناء الجمود تُزاح للأمام بعدد أيام الجمود كي لا تُحتسب هذه الأيام */
  function planStart() {
    var f = freezeInfo();
    if (f && inFreeze(todayStr())) return addDays(lifeStart(), f.days);
    return lifeStart();
  }

  function yearIndex(date) {
    var diff = dayDiff(planStart(), date);
    if (diff < 0) return 1;
    return Math.floor(diff / yearLen()) + 1;
  }
  function weekInYear(date) {
    var diff = dayDiff(planStart(), date);
    if (diff < 0) return 1;
    return Math.floor((diff % yearLen()) / 7) + 1;
  }
  function monthIndex(dateStr) {
    var p = String(dateStr).split('-').map(Number);
    return p[1] - 1;
  }
  function yearStartDate(year) { return addDays(planStart(), (year - 1) * yearLen()); }
  function weekStartDate(year, week) { return addDays(yearStartDate(year), (week - 1) * 7); }
  function weekEndDate(year, week) { return addDays(weekStartDate(year, week), 6); }
  function weekWindow(x, week) {
    var w = Math.max(1, Math.round(num(x.week, 1)));
    var n = Math.max(1, Math.round(num(x.weeks, 1)));
    return week >= w && week <= w + n - 1;
  }

  function num(v, dflt) {
    var n = Number(v);
    return Number.isFinite(n) ? n : dflt;
  }

  function weeksForGoal(weeks, durationType) {
    var w = Math.max(1, Math.round(num(weeks, 1)));
    if (durationType === 'months') return w * 4;
    if (durationType === 'quarters') return w * 13;
    return w;
  }

  /* ===== التخزين ===== */
  function fresh() {
    return {
      settings: Object.assign({}, DEFAULTS),
      projects: [],
      project_tasks: [],
      tasks: [],
      sessions: [],
      desires: [],
      goals: [],
      subgoals: [],
      habits: [],
      simple_habits: [],
      barrier_tasks: [],
      barrier_hosts: [],
      notes: [],
      posts: [],
      values: [],
      experiences: [],
      exp_categories: [],
      challenges: []
    };
  }

  var db = fresh();

  /* ===== تطبيع البيانات التالفة (إصلاح الترميز العكسي للـ localStorage) ===== */
  function normalizeCorruptedData() {
    var corruptedTypeMap = {
      '\u0637\u00A7\u0638': '\u0639\u0627\u0645',
      '\u0638\u0651\u062A\u0627\u0628': '\u0643\u062A\u0627\u0628',
      '\u0641\u064A\u062F\u064A\u0648': '\u0641\u064A\u062F\u064A\u0648',
      '\u0643\u0648\u0631\u0633': '\u0643\u0648\u0631\u0633',
      '\u062F\u0631\u0627\u0633\u0629': '\u062F\u0631\u0627\u0633\u0629',
      '\u0643\u062A\u0627\u0628': '\u0643\u062A\u0627\u0628'
    };
    function fix(s) {
      if (!s) return s;
      var out = String(s);
      for (var bad in corruptedTypeMap) {
        if (out.indexOf(bad) !== -1) out = out.replace(new RegExp(bad, 'g'), corruptedTypeMap[bad]);
      }
      return out;
    }
    if (db.projects) db.projects.forEach(function (p) { p.type = fix(p.type); });
    if (db.posts) db.posts.forEach(function (p) { p.space = fix(p.space); p.sub = fix(p.sub); });
    if (db.habits) db.habits.forEach(function (h) { if (h.type) h.type = fix(h.type); });
    if (db.tasks) db.tasks.forEach(function (t) { if (t.source) t.source = fix(t.source); });
    if (db.barrier_tasks) db.barrier_tasks.forEach(function (b) { if (b.category) b.category = fix(b.category); });
    if (db.notes) db.notes.forEach(function (n) { if (n.type) n.type = fix(n.type); });
  }

  function load() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.settings) {
          db = d;
          if (!db.projects) db.projects = [];
          if (!db.project_tasks) db.project_tasks = [];
          if (!db.tasks) db.tasks = [];
          if (!db.sessions) db.sessions = [];
          if (!db.desires) db.desires = [];
          if (!db.goals) db.goals = [];
          if (!db.subgoals) db.subgoals = [];
          if (!db.habits) db.habits = [];
          if (!db.simple_habits) db.simple_habits = [];
          if (!db.barrier_tasks) db.barrier_tasks = [];
          if (!db.barrier_hosts) db.barrier_hosts = [];
          if (!db.notes) db.notes = [];
          if (!db.posts) db.posts = [];
          if (!db.values) db.values = [];
          if (!db.experiences) db.experiences = [];
          if (!db.exp_categories) db.exp_categories = [];
          if (!db.challenges) db.challenges = [];
          for (var k in DEFAULTS) if (db.settings[k] === undefined) db.settings[k] = DEFAULTS[k];
          normalizeCorruptedData();
          if (db.posts) db.posts.forEach(function (p) {
            if (p.space === 'knowledge' && !p.tags) {
              p.tags = JSON.stringify(['idea']);
            }
          });
          return;
        }
      }
    } catch (e) { /* التخزين معطّل — نعمل في الذاكرة */ }
    db = fresh();
  }

  function save() {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(KEY, JSON.stringify(db));
        global.localStorage.setItem('noor_last_change', String(Date.now()));
      }
    } catch (e) {
      /* امتلاء التخزين: لا نتجاهل بصمت — ننبّه الواجهة عبر حدث */
      try { if (typeof global.dispatchEvent === 'function') global.dispatchEvent(new CustomEvent('noor-quota')); } catch (_) {}
    }
    try { if (typeof global.NoorPersistHook === 'function') global.NoorPersistHook(); } catch (e) {}
  }

  /* لكتّاب localStorage المباشرين خارج KEY (اليوميات، عادات بسيطة):
     يحدّث طابع آخر تغيير ويدفع لقطة — وإلا بقيت تعديلاتها بلا مزامنة ومعرّضة للتراجع */
  function touchSync() {
    try { if (global.localStorage) global.localStorage.setItem('noor_last_change', String(Date.now())); } catch (e) {}
    try { if (typeof global.NoorPersistHook === 'function') global.NoorPersistHook(); } catch (e) {}
  }

  function nextId(list) {
    return list.reduce(function (m, x) { return Math.max(m, Number(x.id) || 0); }, 0) + 1;
  }

  /* ===== تنظيف الكائنات ===== */
  function daysIn(daysStr) {
    return String(daysStr || '').split(',').map(function (x) { return parseInt(x, 10); })
      .filter(function (x) { return Number.isInteger(x) && x >= 0 && x <= 6; });
  }

  function projectName(pid) {
    if (!pid) return null;
    for (var i = 0; i < db.projects.length; i++) if (db.projects[i].id === pid) return db.projects[i].name;
    return null;
  }

  /* الأيام المسموح بها للمشروع: إن لم تُحدد (بيانات قديمة) → كل الأيام */
  function allowedDays(p) {
    var d = daysIn(p.days);
    return d.length ? d : [0, 1, 2, 3, 4, 5, 6];
  }

  function cleanTask(t) {
    return {
      id: num(t.id, 0), date: t.date, title: t.title, desc: t.desc || '',
      project_id: t.project_id ? num(t.project_id, null) : null, project_name: projectName(t.project_id),
      source: t.source || 'manual', src_id: t.src_id ? num(t.src_id, null) : null,
      done: !!t.done, carried: !!t.carried, sort: num(t.sort, 0),
      archived_at: t.archived_at || null, created_at: t.created_at || null
    };
  }

  function cleanProjectTask(pt) {
    return {
      id: num(pt.id, 0), project_id: pt.project_id ? num(pt.project_id, null) : null, title: pt.title, desc: pt.desc || '',
      days: pt.days || '', days_arr: daysIn(pt.days), sort: num(pt.sort, 0),
      hours: Math.max(0, Math.round(num(pt.hours, 0))),
      sources: cleanSources(pt.sources),
      completed_at: pt.completed_at || null,
      archived_at: pt.archived_at || null, created_at: pt.created_at || null
    };
  }

  function cleanProject(p) {
    var tasks = db.tasks.filter(function (t) { return t.project_id === p.id && !t.archived_at; }).length;
    var pts = db.project_tasks.filter(function (t) { return t.project_id === p.id && !t.archived_at; });
    return {
      id: num(p.id, 0), name: p.name, notes: p.notes || '', color: p.color || '',
      active: !!p.active, sort: num(p.sort, 0), priority: num(p.priority, 1),
      type: p.type || 'عام',
      cover: p.cover || '',
      author: p.author || '',
      rating: p.rating !== undefined && p.rating !== null && p.rating !== '' ? Math.min(5, Math.max(0, Number(p.rating))) : 0,
      summary: p.summary || '',
      file_name: p.file_name || '',
      file: p.file || '',
      link: p.link || '',
      video_url: p.video_url || '',
      video_urls: Array.isArray(p.video_urls) ? p.video_urls : (p.video_url ? [p.video_url] : []),
      goal_id: p.goal_id ? Number(p.goal_id) : null,
      subgoal_id: p.subgoal_id ? Number(p.subgoal_id) : null,
      week: Math.max(1, Math.round(num(p.week, 1))),
      weeks: Math.max(1, Math.round(num(p.weeks, 1))),
      start_date: p.start_date || null,
      days: allowedDays(p), days_str: p.days || '',
      focused: !!p.focused,
      archived_at: p.archived_at || null,
      completed_at: p.completed_at || null,
      tasks_count: tasks, project_tasks_count: pts.length,
      tasks: pts.map(cleanProjectTask),
      created_at: p.created_at || null
    };
  }

  function projectPriority(pid) {
    if (!pid) return 999999;
    for (var i = 0; i < db.projects.length; i++) {
      if (db.projects[i].id === pid) return num(db.projects[i].priority, 1);
    }
    return 999999;
  }

  /* ترتيب مهام اليوم تلقائيًا: مهام المشاريع أولًا حسب أولويتها، ثم بقية المهام */
  function applyPriorityOrder(today) {
    var todays = db.tasks.filter(function (t) { return t.date === today && !t.archived_at; });
    var proj = todays.filter(function (t) { return t.source === 'project'; });
    var rest = todays.filter(function (t) { return t.source !== 'project'; });
    proj.sort(function (a, b) {
      var pa = projectPriority(a.project_id), pb = projectPriority(b.project_id);
      if (pa !== pb) return pa - pb;
      return (a.sort || 0) - (b.sort || 0) || a.id - b.id;
    });
    rest.sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || a.id - b.id; });
    proj.forEach(function (t, i) { t.sort = i + 1; });
    rest.forEach(function (t, i) { t.sort = proj.length + i + 1; });
    save();
  }

  /* ===== المهام اليومية =====
     عادة: لا تُرحّل — فشلُ اليوم يبقى في يومه (✗).
     مهمة مشروع: تُرحّل حتى تُنجز، وبمجرد الإنجاز لا تتكرر. */
  function daily() {
    var today = todayStr();
    var carried = 0, generated = 0;
    var year = yearIndex(today), week = weekInYear(today);
    var wd = weekdayOf(today);

    db.tasks.forEach(function (t) {
      if (t.date < today && !t.done && !t.archived_at && t.source !== 'habit') {
        /* مهمة مشروع لمشروع/مهمة مُنجزة أو مؤرشفة → تُؤرشف ولا تُرحّل بعد الآن */
        if (t.source === 'project') {
          var pt = db.project_tasks.find(function (x) { return x.id === t.src_id; });
          var pr = db.projects.find(function (x) { return x.id === t.project_id; });
          if (pt && (pt.archived_at || pt.completed_at)) { t.archived_at = nowStamp(); return; }
          if (pr && (pr.archived_at || pr.completed_at)) { t.archived_at = nowStamp(); return; }
          /* فرع الهدف غير نشط في هذا الأسبوع → تُؤرشف المهمة ولا تُرحَّل بعد انتهاء مدة الفرع */
          if (pr && pr.subgoal_id && !subgoalActiveThisWeek(pr.subgoal_id, year, week)) { t.archived_at = nowStamp(); return; }
          /* اليوم غير مسموح للمشروع → تبقى المهمة في يومها وتظهر في أول يوم مسموح */
          if (pr && allowedDays(pr).indexOf(wd) === -1) return;
        }
        t.date = today; t.carried = 1; carried++;
      }
    });

    var act = activeForWeek(year, week);

    act.habits.forEach(function (h) {
      if (daysIn(h.days).indexOf(wd) === -1) return;
      if (h.start_date && today < h.start_date) return;
      var exists = db.tasks.some(function (t) { return t.date === today && t.source === 'habit' && t.src_id === h.id && !t.archived_at; });
      if (exists) return;
      db.tasks.push({
        id: nextId(db.tasks), date: today, title: h.title, desc: '', project_id: null,
        source: 'habit', src_id: h.id, done: 0, carried: 0, sort: 0, archived_at: null, created_at: nowStamp()
      });
      generated++;
    });

    act.projects.forEach(function (p) {
      /* المشروع المُنجز بالكامل → لا تظهر مهامه */
      if (p.completed_at) return;
      /* اليوم غير مسموح للمشروع → لا تظهر مهامه وتُترك لأول يوم مسموح */
      if (allowedDays(p).indexOf(wd) === -1) return;
      /* عادة متكررة: تظهر جميع مهامها غير المنجزة كل يوم (تكرار يومي) */
      if (p.type === 'عادة') {
        var incomplete = db.project_tasks
          .filter(function (pt) { return pt.project_id === p.id && !pt.archived_at && !pt.completed_at; })
          .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || a.id - b.id; });
        if (!incomplete.length) return;
        /* أرشفة أي نسخ قديمة لنفس المشروع اليوم */
        db.tasks.forEach(function (t) {
          if (t.date === today && t.source === 'project' && t.project_id === p.id && !t.archived_at) {
            var ptDone = db.project_tasks.find(function (x) { return x.id === t.src_id; });
            if (ptDone && (ptDone.completed_at || ptDone.archived_at)) t.archived_at = nowStamp();
          }
        });
        incomplete.forEach(function (pt) {
          var exists = db.tasks.some(function (t) {
            return t.date === today && t.source === 'project' && t.src_id === pt.id && !t.archived_at;
          });
          if (exists) return;
          db.tasks.push({
            id: nextId(db.tasks), date: today, title: pt.title, desc: pt.desc || '',
            project_id: pt.project_id, source: 'project', src_id: pt.id,
            done: 0, carried: 0, sort: pt.id || 0, archived_at: null, created_at: nowStamp()
          });
          generated++;
        });
        return;
      }
      /* المهام المتسلسلة: المهمة التالية غير المنجزة فقط تظهر — واحدة في اليوم */
      var next = db.project_tasks
        .filter(function (pt) { return pt.project_id === p.id && !pt.archived_at && !pt.completed_at; })
        .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || a.id - b.id; })[0];
      if (!next) return;
      /* أي نسخ زائدة لنفس المشروع في اليوم → تُؤرشف (لا تظهر مهمتان معًا).
         المهمة المُنجزة اليوم تُحتسب أيضاً «موجودة» حتى لا تتولد التالية فوراً
         بعد الإنجاز — القاعدة واحدة في اليوم، والتالية تبدأ في يوم جديد */
      var kept = 0;
      db.tasks.forEach(function (t) {
        if (t.date === today && t.source === 'project' && t.project_id === p.id && !t.archived_at) {
          if (!t.done && t.src_id !== next.id) t.archived_at = nowStamp();
          else kept = 1;
        }
      });
      if (kept) return;
      db.tasks.push({
        id: nextId(db.tasks), date: today, title: next.title, desc: next.desc || '',
        project_id: next.project_id, source: 'project', src_id: next.id,
        done: 0, carried: 0, sort: 0, archived_at: null, created_at: nowStamp()
      });
      generated++;
    });

    if (generated > 0) applyPriorityOrder(today);
    else save();

    var tasks = db.tasks.filter(function (t) { return t.date === today && !t.archived_at; })
      .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || a.id - b.id; })
      .map(cleanTask);

    return { date: today, weekday: WEEKDAYS[wd], tasks: tasks, meta: { carried: carried, generated: generated } };
  }

  function addTask(b) {
    var title = String(b.title || '').trim();
    if (!title) throw new Error('العنوان مطلوب');
    var project_id = b.project_id ? Number(b.project_id) : null;
    if (project_id) {
      var p = db.projects.find(function (x) { return x.id === project_id && !x.archived_at; });
      if (!p) throw new Error('المشروع غير موجود');
    }
    var today = todayStr();
    var maxSort = db.tasks.filter(function (t) { return t.date === today; })
      .reduce(function (m, t) { return Math.max(m, t.sort || 0); }, 0);
    var task = {
      id: nextId(db.tasks), date: today, title: title, desc: String(b.desc || ''),
      project_id: project_id, source: 'manual', src_id: null,
      done: 0, carried: 0, sort: maxSort + 1, archived_at: null, created_at: nowStamp()
    };
    db.tasks.push(task);
    save();
    return cleanTask(task);
  }

  function updateTask(id, b) {
    var t = db.tasks.find(function (x) { return x.id === id && !x.archived_at; });
    if (!t) throw new Error('المهمة غير موجودة');
    if (b.title !== undefined) {
      var title = String(b.title || '').trim();
      if (!title) throw new Error('العنوان مطلوب');
      t.title = title;
    }
    if (b.desc !== undefined) t.desc = String(b.desc || '');
    if (b.project_id !== undefined) {
      var pid = b.project_id ? Number(b.project_id) : null;
      if (pid) {
        var pr = db.projects.find(function (x) { return x.id === pid && !x.archived_at; });
        if (!pr) throw new Error('المشروع غير موجود');
      }
      t.project_id = pid;
    }
    save();
    return cleanTask(t);
  }

  function toggleTask(id, done) {
    var t = db.tasks.find(function (x) { return x.id === id && !x.archived_at; });
    if (!t) throw new Error('المهمة غير موجودة');
    t.done = done ? 1 : 0;
    if (t.source === 'project' && t.src_id) {
      var pt = db.project_tasks.find(function (x) { return x.id === t.src_id; });
      var pr = pt ? db.projects.find(function (x) { return x.id === pt.project_id; }) : null;
      /* عادة متكررة (عادة): لا تُنجز المهمة الأصلية عند التأشير — تظهر كل يوم من جديد */
      if (pr && pr.type === 'عادة') {
        save();
        return cleanTask(t);
      }
      if (pt) {
        if (done) {
          pt.completed_at = pt.completed_at || nowStamp();
          db.tasks.forEach(function (r) {
            if (r.source === 'project' && r.src_id === pt.id && !r.done && !r.archived_at && r.id !== t.id) r.archived_at = nowStamp();
          });
        } else {
          pt.completed_at = null;
        }
        syncProjectCompletion(pt.project_id);
      }
    }
    save();
    return cleanTask(t);
  }

  function syncProjectCompletion(pid) {
    var p = db.projects.find(function (x) { return x.id === pid && !x.archived_at; });
    if (!p) return;
    var pts = db.project_tasks.filter(function (x) { return x.project_id === pid && !x.archived_at; });
    var allDone = pts.length > 0 && pts.every(function (x) { return !!x.completed_at; });
    if (allDone) p.completed_at = p.completed_at || nowStamp();
    else if (p.completed_at && pts.some(function (x) { return !x.completed_at; })) p.completed_at = null;
  }

  function reorderTasks(ids) {
    var today = todayStr();
    var todayTasks = db.tasks.filter(function (x) { return x.date === today && !x.archived_at; });
    var order = (Array.isArray(ids) ? ids : []).map(Number);
    var position = 1;
    order.forEach(function (id) {
      var t = db.tasks.find(function (x) { return x.id === id && x.date === today && !x.archived_at; });
      if (t) t.sort = position++;
    });
    todayTasks.forEach(function (t) {
      if (order.indexOf(t.id) === -1) t.sort = position++;
    });
    save();
  }

  function archiveTask(id) {
    var t = db.tasks.find(function (x) { return x.id === id && !x.archived_at; });
    if (!t) throw new Error('المهمة غير موجودة');
    t.archived_at = nowStamp();
    save();
  }

  /* ===== المشاريع ===== */
  function getProjects() {
    return db.projects.filter(function (p) { return !p.archived_at && p.type !== 'عادة'; })
      .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || a.id - b.id; })
      .map(cleanProject);
  }

  /* هل التخزين المحلي فارغ تمامًا (أول استخدام) — حتى لا نستبدل بيانات المستخدم بلقطة خادم */
  function isEmpty() {
    return !db.projects.length && !db.goals.length && !db.tasks.length &&
      !db.habits.length && !db.posts.length && !db.values.length && !db.subgoals.length;
  }

  /* مشروع سواء أكان نشطًا أو مؤرشفًا — لعرض تفاصيله من الأرشيف */
  function getProjectById(id) {
    var p = db.projects.find(function (x) { return x.id === Number(id); });
    return p ? cleanProject(p) : null;
  }

  /* كل مهام مشروع (نشطة ومؤرشفة) — لعرضها في تفاصيل المشروع المؤرشف */
  function getProjectTasksAll(pid) {
    return db.project_tasks.filter(function (t) { return t.project_id === Number(pid); })
      .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || a.id - b.id; })
      .map(cleanProjectTask);
  }

  function addProject(b) {
    var name = String(b.name || '').trim();
    if (!name) throw new Error('اسم المشروع مطلوب');
    var maxSort = db.projects.reduce(function (m, p) { return Math.max(m, p.sort || 0); }, 0);
    var maxPrio = db.projects.reduce(function (m, p) { return Math.max(m, num(p.priority, 0)); }, 0);
    var proj = {
      id: nextId(db.projects), name: name, notes: String(b.notes || ''), color: String(b.color || ''),
      active: 1, sort: maxSort + 1, priority: Math.max(1, Math.round(num(b.priority, maxPrio + 1))),
      type: String(b.type || 'عام'),
      cover: String(b.cover || ''),
      author: String(b.author || ''),
      rating: b.rating !== undefined && b.rating !== null && b.rating !== '' ? Math.min(5, Math.max(0, Number(b.rating))) : 0,
      summary: String(b.summary || ''),
      file_name: String(b.file_name || ''),
      file: String(b.file || ''),
      link: String(b.link || ''),
      video_url: String(b.video_url || ''),
      video_urls: Array.isArray(b.video_urls) ? b.video_urls.filter(function (x) { return !!x; }) : (b.video_url ? [b.video_url] : []),
      goal_id: b.goal_id ? Number(b.goal_id) : null,
      subgoal_id: b.subgoal_id ? Number(b.subgoal_id) : null,
      week: Math.max(1, Math.round(num(b.week, 1))),
      weeks: Math.max(1, Math.round(num(b.weeks, 1))),
      days: Array.isArray(b.days) ? b.days.map(Number).filter(function (x) { return x >= 0 && x <= 6; }).join(',') : '',
      start_date: b.start_date || todayStr(),
      archived_at: null, created_at: nowStamp()
    };
    db.projects.push(proj);
    save();
    return cleanProject(proj);
  }

  function updateProject(id, b) {
    var p = db.projects.find(function (x) { return x.id === id && !x.archived_at; });
    if (!p) throw new Error('المشروع غير موجود');
    if (b.name !== undefined) {
      var name = String(b.name || '').trim();
      if (!name) throw new Error('اسم المشروع مطلوب');
      p.name = name;
    }
    if (b.notes !== undefined) p.notes = String(b.notes || '');
    if (b.color !== undefined) p.color = String(b.color || '');
    if (b.type !== undefined) p.type = String(b.type || 'عام');
    if (b.cover !== undefined) p.cover = String(b.cover || '');
    if (b.author !== undefined) p.author = String(b.author || '');
    if (b.rating !== undefined && b.rating !== null && b.rating !== '') p.rating = Math.min(5, Math.max(0, Number(b.rating)));
    if (b.summary !== undefined) p.summary = String(b.summary || '');
    if (b.file_name !== undefined) p.file_name = String(b.file_name || '');
    if (b.file !== undefined) p.file = String(b.file || '');
    if (b.link !== undefined) p.link = String(b.link || '');
    if (b.video_url !== undefined) p.video_url = String(b.video_url || '');
    if (b.video_urls !== undefined) p.video_urls = Array.isArray(b.video_urls) ? b.video_urls.filter(function (x) { return !!x; }) : (b.video_url ? [b.video_url] : []);
    if (b.priority !== undefined) {
      var pr = Math.max(1, Math.round(num(b.priority, 1)));
      if (pr !== num(p.priority, 1)) { p.priority = pr; applyPriorityOrder(todayStr()); }
    }
    if (b.goal_id !== undefined) p.goal_id = b.goal_id ? Number(b.goal_id) : null;
    if (b.subgoal_id !== undefined) p.subgoal_id = b.subgoal_id ? Number(b.subgoal_id) : null;
    if (b.week !== undefined) p.week = Math.max(1, Math.round(num(b.week, 1)));
    if (b.weeks !== undefined) p.weeks = Math.max(1, Math.round(num(b.weeks, 1)));
    if (b.days !== undefined) p.days = Array.isArray(b.days) ? b.days.map(Number).filter(function (x) { return x >= 0 && x <= 6; }).join(',') : '';
    /* وضع التركيز: علامة اختيارية على المشروع — لا تؤثر على بقية المشاريع ولا على قاعدة الطابور */
    if (b.focused !== undefined) p.focused = !!b.focused;
    save();
    return cleanProject(p);
  }

  function archiveProject(id) {
    var p = db.projects.find(function (x) { return x.id === id && !x.archived_at; });
    if (!p) throw new Error('المشروع غير موجود');
    p.archived_at = nowStamp();
    db.project_tasks.forEach(function (t) { if (t.project_id === id && !t.archived_at) t.archived_at = nowStamp(); });
    db.tasks.forEach(function (t) {
      if (t.source === 'project' && t.project_id === id && !t.done && !t.archived_at) t.archived_at = nowStamp();
    });
    save();
  }

  /* إنجاز المشروع بالكامل: صح على صندوق المشروع = منجز كاملًا، وتتوقف مهامه */
  function completeProject(id) {
    var p = db.projects.find(function (x) { return x.id === id && !x.archived_at; });
    if (!p) throw new Error('المشروع غير موجود');
    p.completed_at = p.completed_at ? null : nowStamp();
    if (p.completed_at) {
      db.tasks.forEach(function (t) {
        if (t.source === 'project' && t.project_id === id && !t.done && !t.archived_at) t.archived_at = nowStamp();
      });
    }
    save();
    return cleanProject(p);
  }

  function archiveAllProjects() {
    var n = 0;
    db.projects.forEach(function (p) { if (!p.archived_at) { p.archived_at = nowStamp(); n++; } });
    db.project_tasks.forEach(function (t) { if (!t.archived_at) t.archived_at = nowStamp(); });
    db.tasks.forEach(function (t) {
      if (t.source === 'project' && !t.done && !t.archived_at) t.archived_at = nowStamp();
    });
    save();
    return { ok: true, archived: n };
  }

  function addProjectTask(pid, b) {
    var p = db.projects.find(function (x) { return x.id === pid && !x.archived_at; });
    if (!p) throw new Error('المشروع غير موجود');
    var title = String(b.title || '').trim();
    if (!title) throw new Error('عنوان المهمة مطلوب');
    var days = (Array.isArray(b.days) && b.days.length ? b.days : [0, 1, 2, 3, 4, 5, 6])
      .map(Number).filter(function (x) { return x >= 0 && x <= 6; });
    var maxSort = db.project_tasks.filter(function (t) { return t.project_id === pid; })
      .reduce(function (m, t) { return Math.max(m, t.sort || 0); }, 0);
    var pt = {
      id: nextId(db.project_tasks), project_id: pid, title: title, desc: String(b.desc || ''),
      days: days.join(','), sort: maxSort + 1, archived_at: null, created_at: nowStamp(),
      hours: Math.max(0, Math.round(num(b.hours, 0))), sources: JSON.stringify(sanitizeSources(b.sources))
    };
    db.project_tasks.push(pt);
    save();
    return cleanProjectTask(pt);
  }

  function updateProjectTask(id, b) {
    var pt = db.project_tasks.find(function (x) { return x.id === id && !x.archived_at; });
    if (!pt) throw new Error('المهمة غير موجودة');
    if (b.title !== undefined) {
      var title = String(b.title || '').trim();
      if (!title) throw new Error('عنوان المهمة مطلوب');
      pt.title = title;
    }
    if (b.desc !== undefined) pt.desc = String(b.desc || '');
    if (b.days !== undefined) {
      var days = (Array.isArray(b.days) ? b.days : []).map(Number).filter(function (x) { return x >= 0 && x <= 6; });
      pt.days = days.join(',');
    }
    if (b.hours !== undefined) pt.hours = Math.max(0, Math.round(num(b.hours, 0)));
    if (b.sources !== undefined) pt.sources = JSON.stringify(sanitizeSources(b.sources));
    save();
    return cleanProjectTask(pt);
  }

  function archiveProjectTask(id) {
    var pt = db.project_tasks.find(function (x) { return x.id === id && !x.archived_at; });
    if (!pt) throw new Error('المهمة غير موجودة');
    pt.archived_at = nowStamp();
    db.tasks.forEach(function (r) {
      if (r.source === 'project' && r.src_id === pt.id && !r.done && !r.archived_at) r.archived_at = nowStamp();
    });
    save();
  }

  function toggleProjectTask(id) {
    var pt = db.project_tasks.find(function (x) { return x.id === id && !x.archived_at; });
    if (!pt) throw new Error('المهمة غير موجودة');
    if (pt.completed_at) {
      pt.completed_at = null;
    } else {
      pt.completed_at = nowStamp();
      db.tasks.forEach(function (r) {
        if (r.source === 'project' && r.src_id === pt.id && !r.done && !r.archived_at) r.archived_at = nowStamp();
      });
    }
    syncProjectCompletion(pt.project_id);
    save();
    return cleanProjectTask(pt);
  }

  /* ===== جلسات المؤقت ===== */
  function getSessions(opts) {
    opts = opts || {};
    return db.sessions
      .filter(function (s) {
        if (opts.from && s.date < opts.from) return false;
        if (opts.to && s.date > opts.to) return false;
        return true;
      })
      .sort(function (a, b) { return a.date === b.date ? a.id - b.id : (a.date < b.date ? -1 : 1); })
      .map(function (s) { return { id: num(s.id, 0), date: s.date, mode: s.mode, minutes: num(s.minutes, 0), project_id: s.project_id ? num(s.project_id, null) : null, pname: projectName(s.project_id), note: s.note || '' }; });
  }

  function addSession(b) {
    var mode = String(b.mode || 'focus');
    var minutes = Math.round(num(b.minutes, 0));
    if (minutes <= 0) throw new Error('المدة غير صالحة');
    var project_id = b.project_id ? Number(b.project_id) : null;
    if (project_id) {
      var p = db.projects.find(function (x) { return x.id === project_id; });
      if (!p) throw new Error('المشروع غير موجود');
    }
    var session = {
      id: nextId(db.sessions), date: b.date || todayStr(), mode: mode, minutes: minutes,
      project_id: project_id, note: String(b.note || ''), created_at: nowStamp()
    };
    db.sessions.push(session);
    save();
    return { id: session.id, date: session.date, mode: mode, minutes: minutes, project_id: project_id, pname: projectName(project_id), note: session.note };
  }

  /* ===== الرغبات ===== */
  function getDesires() {
    return db.desires.filter(function (d) { return !d.archived_at; })
      .sort(function (a, b) { return b.id - a.id; })
      .map(function (d) {
        return { id: num(d.id, 0), text: d.text, week_start: d.week_start || null, target_pct: num(d.target_pct, 80), created_at: d.created_at || null };
      });
  }

  function addDesire(text, targetPct) {
    text = String(text || '').trim();
    if (!text) throw new Error('نص الرغبة مطلوب');
    var d = {
      id: nextId(db.desires), text: text, week_start: todayStr(),
      target_pct: Math.min(100, Math.max(1, num(targetPct, 80))),
      archived_at: null, created_at: nowStamp()
    };
    db.desires.push(d);
    save();
    return { id: d.id, text: d.text, week_start: d.week_start, target_pct: d.target_pct, created_at: d.created_at };
  }

  function updateDesire(id, b) {
    var d = db.desires.find(function (x) { return x.id === id && !x.archived_at; });
    if (!d) throw new Error('الرغبة غير موجودة');
    if (b.text !== undefined) {
      var text = String(b.text || '').trim();
      if (!text) throw new Error('نص الرغبة مطلوب');
      d.text = text;
    }
    if (b.target_pct !== undefined) d.target_pct = Math.min(100, Math.max(1, num(b.target_pct, 80)));
    save();
    return { id: d.id, text: d.text, week_start: d.week_start, target_pct: d.target_pct, created_at: d.created_at };
  }

  function archiveDesire(id) {
    var d = db.desires.find(function (x) { return x.id === id && !x.archived_at; });
    if (!d) throw new Error('الرغبة غير موجودة');
    d.archived_at = nowStamp();
    save();
  }

  /* ===== الأهداف الحياتية =====
     المستوى 1: هدف حياتي → سنة (السنة = عدد أسابيع قابلة للضبط).
     المستوى 2: مهمة فرعية → أسبوع داخل سنة الهدف.
     المستوى 3: عادة (تتكرر في أيام مسموحة) أو مشروع (مهام بأيام محددة). */
  function setLifeStart(date) {
    db.settings.life_start = date || todayStr();
    save();
  }

  function goalYears(g) {
    if (Array.isArray(g.years) && g.years.length) {
      return g.years.map(function (y) { return Math.max(1, Math.round(num(y, 1))); })
        .filter(function (y, i, a) { return a.indexOf(y) === i; })
        .sort(function (a, b) { return a - b; });
    }
    return [Math.max(1, Math.round(num(g.year, 1)))];
  }
  function goalFirstYear(g) { return goalYears(g)[0]; }
  function goalDurationYears(g) {
    var v = Number(g.duration_years);
    if (Number.isFinite(v) && v > 0) return v;
    return goalYears(g).length;
  }
  function cleanGoal(g) {
    var subs = db.subgoals.filter(function (s) { return s.goal_id === g.id && !s.archived_at; });
    return {
      id: num(g.id, 0), title: g.title, color: g.color || DEFAULT_COLOR, icon: g.icon || '',
      year: Math.max(1, Math.round(num(g.year, 1))),
      years: goalYears(g),
      duration_years: goalDurationYears(g),
      value_id: g.value_id ? num(g.value_id, null) : null,
      details: g.details || '',
      duration_type: g.duration_type || 'weeks',
      subgoals_count: subs.length,
      completed_at: g.completed_at || null,
      archived_at: g.archived_at || null, created_at: g.created_at || null
    };
  }

  function getGoals() {
    return db.goals.filter(function (g) { return !g.archived_at; })
      .sort(function (a, b) { return (a.year || 1) - (b.year || 1) || (a.sort || 0) - (b.sort || 0) || a.id - b.id; })
      .map(cleanGoal);
  }

  function addGoal(b) {
    var title = String(b.title || '').trim();
    if (!title) throw new Error('عنوان الهدف مطلوب');
    var maxSort = db.goals.reduce(function (m, g) { return Math.max(m, g.sort || 0); }, 0);
    var years = (Array.isArray(b.years) && b.years.length)
      ? b.years.map(function (y) { return Math.max(1, Math.round(num(y, 1))); })
      : null;
    var startYear = years ? Math.min.apply(null, years) : Math.max(1, Math.round(num(b.year, 1)));
    var dv = Number(b.duration_years);
    var g = {
      id: nextId(db.goals), title: title, color: String(b.color || DEFAULT_COLOR), icon: String(b.icon || ''),
      year: startYear,
      years: years,
      duration_years: (Number.isFinite(dv) && dv > 0) ? dv : (years ? years.length : 1),
      value_id: b.value_id ? Number(b.value_id) : null,
      details: String(b.details || ''),
      duration_type: String(b.duration_type || 'weeks'),
      sort: maxSort + 1,
      archived_at: null, created_at: nowStamp()
    };
    db.goals.push(g);
    save();
    return cleanGoal(g);
  }

  function updateGoal(id, b) {
    var g = db.goals.find(function (x) { return x.id === id && !x.archived_at; });
    if (!g) throw new Error('الهدف غير موجود');
    if (b.title !== undefined) {
      var title = String(b.title || '').trim();
      if (!title) throw new Error('عنوان الهدف مطلوب');
      g.title = title;
    }
    if (b.color !== undefined) g.color = String(b.color || '');
    if (b.icon !== undefined) g.icon = String(b.icon || '');
    if (b.year !== undefined) g.year = Math.max(1, Math.round(num(b.year, 1)));
    if (b.years !== undefined) {
      if (Array.isArray(b.years) && b.years.length) {
        g.years = b.years.map(function (y) { return Math.max(1, Math.round(num(y, 1))); });
        g.year = Math.min.apply(null, g.years);
      } else {
        g.years = null;
      }
    }
    if (b.duration_years !== undefined) {
      var dv = Number(b.duration_years);
      g.duration_years = (Number.isFinite(dv) && dv > 0) ? dv : null;
    }
    if (b.completed_at !== undefined) g.completed_at = b.completed_at || null;
    if (b.value_id !== undefined) g.value_id = b.value_id ? Number(b.value_id) : null;
    if (b.details !== undefined) g.details = String(b.details || '');
    if (b.duration_type !== undefined) g.duration_type = String(b.duration_type || 'weeks');
    save();
    return cleanGoal(g);
  }

  function goalIsCompleted(g) {
    if (g.completed_at) return true;
    var projs = db.projects.filter(function (p) { return p.goal_id === g.id && !p.archived_at; });
    if (!projs.length) return false;
    /* المشروع مكتمل فقط إذا وُسم هو نفسه مكتملًا، أو كل مهامه في الجدول مكتملة.
       ملاحظة حرجة: مشروع بلا مهام أو بمهام معلقة ⇒ ليس مكتملًا — ولا يصح
       الاعتماد على خاصية tasks المدمجة القديمة فمصدر الحقيقة هو project_tasks. */
    return projs.every(function (p) {
      if (p.completed_at) return true;
      var pts = db.project_tasks.filter(function (x) { return x.project_id === p.id && !x.archived_at; });
      if (!pts.length) return false;
      return pts.every(function (x) { return !!x.completed_at; });
    });
  }
  function toggleGoalComplete(id) {
    var g = db.goals.find(function (x) { return x.id === Number(id) && !x.archived_at; });
    if (!g) throw new Error('الهدف غير موجود');
    g.completed_at = goalIsCompleted(g) ? null : nowStamp();
    save();
    return cleanGoal(g);
  }
  function setGoalComplete(id, done) {
    var g = db.goals.find(function (x) { return x.id === Number(id) && !x.archived_at; });
    if (!g) throw new Error('الهدف غير موجود');
    g.completed_at = done ? nowStamp() : null;
    save();
    return cleanGoal(g);
  }

  /* الأهداف النشطة (الظاهرة) في سنة معينة:
     لكل قيمة: الهدف الأول غير المكتمل فقط هو الظاهر (حسب ترتيب سنواته)،
     ولا تظهر أهداف نفس القيمة التالية حتى يُكمل المستخدم الهدف السابق.
     الأهداف بدون قيمة تظهر مباشرة في سنواتها. */
  function activeGoalsForYear(year) {
    year = Math.max(1, Math.round(num(year, 1)));
    var out = [];
    var values = db.values.filter(function (v) { return !v.archived_at; })
      .sort(function (a, b) {
        return (num(a.priority, num(a.sort, 0) + 1)) - (num(b.priority, num(b.sort, 0) + 1))
          || (a.sort || 0) - (b.sort || 0) || a.id - b.id;
      });
    values.forEach(function (v) {
      var goals = db.goals.filter(function (g) { return !g.archived_at && g.value_id === v.id; })
        .sort(function (a, b) { return goalFirstYear(a) - goalFirstYear(b) || (a.sort || 0) - (b.sort || 0) || a.id - b.id; });
      var front = null;
      for (var i = 0; i < goals.length; i++) {
        if (!goalIsCompleted(goals[i])) { front = goals[i]; break; }
      }
      if (front && goalYears(front).indexOf(year) >= 0) out.push(front);
    });
    db.goals.filter(function (g) { return !g.archived_at && !g.value_id; })
      .sort(function (a, b) { return goalFirstYear(a) - goalFirstYear(b) || (a.sort || 0) - (b.sort || 0) || a.id - b.id; })
      .forEach(function (g) {
        if (!goalIsCompleted(g) && goalYears(g).indexOf(year) >= 0) out.push(g);
      });
    return out.map(cleanGoal);
  }

  function archiveGoal(id) {
    var g = db.goals.find(function (x) { return x.id === id && !x.archived_at; });
    if (!g) throw new Error('الهدف غير موجود');
    g.archived_at = nowStamp();
    db.subgoals.forEach(function (s) { if (s.goal_id === id && !s.archived_at) s.archived_at = nowStamp(); });
    db.habits.forEach(function (h) { if (h.goal_id === id && !h.archived_at) h.archived_at = nowStamp(); });
    db.projects.forEach(function (p) { if (p.goal_id === id && !p.archived_at) p.archived_at = nowStamp(); });
    save();
  }

  /* ===== القيم (المستوى الأعلى: قيمة ← أهداف ← مهام فرعية ← مشاريع) =====
     القيم ليست مرتبطة بسنة — تُدخل عند بداية النظام وتظهر فوق الأهداف. */
  function cleanValue(v) {
    return {
      id: num(v.id, 0), title: v.title, icon: v.icon || '', color: v.color || '',
      priority: Math.max(1, Math.round(num(v.priority, num(v.sort, 0) + 1))),
      goals_count: db.goals.filter(function (g) { return g.value_id === v.id && !g.archived_at; }).length,
      archived_at: v.archived_at || null, created_at: v.created_at || null
    };
  }

  function getValues() {
    return db.values.filter(function (v) { return !v.archived_at; })
      .sort(function (a, b) {
        return (num(a.priority, num(a.sort, 0) + 1)) - (num(b.priority, num(b.sort, 0) + 1))
          || (a.sort || 0) - (b.sort || 0) || a.id - b.id;
      })
      .map(cleanValue);
  }

  function getGoalsByValue(valueId) {
    return db.goals.filter(function (g) { return !g.archived_at && g.value_id === valueId; })
      .sort(function (a, b) { return (a.year || 1) - (b.year || 1) || (a.sort || 0) - (b.sort || 0) || a.id - b.id; })
      .map(cleanGoal);
  }

  function addValue(b) {
    var title = String(b.title || '').trim();
    if (!title) throw new Error('عنوان القيمة مطلوب');
    var maxSort = db.values.reduce(function (m, v) { return Math.max(m, v.sort || 0); }, 0);
    var v = {
      id: nextId(db.values), title: title, icon: String(b.icon || ''), color: String(b.color || ''),
      priority: Math.max(1, Math.round(num(b.priority, maxSort + 1))),
      sort: maxSort + 1, archived_at: null, created_at: nowStamp()
    };
    db.values.push(v);
    save();
    return cleanValue(v);
  }

  function updateValue(id, b) {
    var v = db.values.find(function (x) { return x.id === id && !x.archived_at; });
    if (!v) throw new Error('القيمة غير موجودة');
    if (b.title !== undefined) {
      var title = String(b.title || '').trim();
      if (!title) throw new Error('عنوان القيمة مطلوب');
      v.title = title;
    }
    if (b.icon !== undefined) v.icon = String(b.icon || '');
    if (b.color !== undefined) v.color = String(b.color || '');
    if (b.priority !== undefined) v.priority = Math.max(1, Math.round(num(b.priority, 1)));
    save();
    return cleanValue(v);
  }

  function archiveValue(id) {
    var v = db.values.find(function (x) { return x.id === id && !x.archived_at; });
    if (!v) throw new Error('القيمة غير موجودة');
    v.archived_at = nowStamp();
    save();
  }

  /* ===== المهام الفرعية ===== */
  function cleanSubgoal(s) {
    return {
      id: num(s.id, 0), goal_id: s.goal_id ? num(s.goal_id, null) : null, title: s.title,
      week: Math.max(1, Math.round(num(s.week, 1))),
      priority: Math.max(1, Math.round(num(s.priority, 999))),
      weeks: Math.max(1, Math.round(num(s.weeks, 1))),
      habits_count: db.habits.filter(function (h) { return h.subgoal_id === s.id && !h.archived_at; }).length,
      projects_count: db.projects.filter(function (p) { return p.subgoal_id === s.id && !p.archived_at; }).length,
      archived_at: s.archived_at || null, created_at: s.created_at || null
    };
  }

  function getSubgoals(goalId) {
    var list = db.subgoals.filter(function (s) { return !s.archived_at && (!goalId || s.goal_id === goalId); });
    return list.sort(function (a, b) { return (a.week || 1) - (b.week || 1) || a.id - b.id; }).map(cleanSubgoal);
  }

  function addSubgoal(b) {
    var title = String(b.title || '').trim();
    if (!title) throw new Error('عنوان المهمة الفرعية مطلوب');
    var g = db.goals.find(function (x) { return x.id === Number(b.goal_id) && !x.archived_at; });
    if (!g) throw new Error('الهدف غير موجود');
    var maxSort = db.subgoals.filter(function (s) { return s.goal_id === g.id; })
      .reduce(function (m, s) { return Math.max(m, s.sort || 0); }, 0);
    var maxPrio = db.subgoals.filter(function (s) { return s.goal_id === g.id; })
      .reduce(function (m, s) { return Math.max(m, num(s.priority, 0)); }, 0);
    var s = {
      id: nextId(db.subgoals), goal_id: g.id, title: title,
      week: Math.min(yearWeeks(), Math.max(1, Math.round(num(b.week, 1)))),
      priority: Math.max(1, Math.round(num(b.priority, maxPrio + 1))),
      weeks: Math.max(1, Math.round(num(b.weeks, 1))),
      sort: maxSort + 1, archived_at: null, created_at: nowStamp()
    };
    db.subgoals.push(s);
    save();
    return cleanSubgoal(s);
  }

  function updateSubgoal(id, b) {
    var s = db.subgoals.find(function (x) { return x.id === id && !x.archived_at; });
    if (!s) throw new Error('المهمة الفرعية غير موجودة');
    if (b.title !== undefined) {
      var title = String(b.title || '').trim();
      if (!title) throw new Error('عنوان المهمة الفرعية مطلوب');
      s.title = title;
    }
    if (b.week !== undefined) s.week = Math.min(yearWeeks(), Math.max(1, Math.round(num(b.week, 1))));
    if (b.priority !== undefined) s.priority = Math.max(1, Math.round(num(b.priority, 1)));
    if (b.weeks !== undefined) s.weeks = Math.max(1, Math.round(num(b.weeks, 1)));
    save();
    return cleanSubgoal(s);
  }

  /* توزيع فروع الهدف على سنوات ظهوره: ترتيب بالأولوية ثم id، مع بداية/نهاية كل فرع
     بتكديس المدد بالأسابيع ابتداءً من أول سنة يظهر فيها الهدف
     (yearWeeks() = أسابيع السنة). لا يتجاوز أي فرع آخر سنة ظهور الهدف. */
  function branchSchedule(goalId) {
    var g = db.goals.find(function (x) { return x.id === Number(goalId); });
    if (!g) return [];
    var list = db.subgoals.filter(function (s) { return s.goal_id === g.id && !s.archived_at; })
      .sort(function (a, b) { return (num(a.priority, 999)) - (num(b.priority, 999)) || a.id - b.id; });
    var cur = 0;
    var w = yearWeeks();
    var yearsArr = goalYears(g);
    var startYear = yearsArr[0];
    var lastYear = yearsArr[yearsArr.length - 1];
    var spanWeeks = (lastYear - startYear + 1) * w;
    return list.map(function (s) {
      var weeks = Math.max(1, Math.round(num(s.weeks, 1)));
      var out = cleanSubgoal(s);
      var s0 = Math.floor(cur / w) + startYear;
      var e0 = Math.floor((cur + weeks - 1) / w) + startYear;
      out.startYear = Math.max(s0, startYear);
      out.endYear = Math.min(Math.max(e0, out.startYear), lastYear);
      cur += weeks;
      if (cur > spanWeeks) cur = spanWeeks;
      return out;
    });
  }

  function archiveSubgoal(id) {
    var s = db.subgoals.find(function (x) { return x.id === id && !x.archived_at; });
    if (!s) throw new Error('المهمة الفرعية غير موجودة');
    s.archived_at = nowStamp();
    db.habits.forEach(function (h) { if (h.subgoal_id === id && !h.archived_at) h.archived_at = nowStamp(); });
    db.projects.forEach(function (p) { if (p.subgoal_id === id && !p.archived_at) p.archived_at = nowStamp(); });
    save();
  }

  /* ===== العادات ===== */
  function cleanHabit(h) {
    return {
      id: num(h.id, 0), title: h.title, icon: h.icon || '', goal_id: h.goal_id ? num(h.goal_id, null) : null, subgoal_id: h.subgoal_id ? num(h.subgoal_id, null) : null,
      minutes: Math.max(0, Math.round(num(h.minutes, 0))),
      days: daysIn(h.days), days_str: h.days || '',
      week: Math.max(1, Math.round(num(h.week, 1))), weeks: Math.max(1, Math.round(num(h.weeks, 1))),
      start_date: h.start_date || todayStr(), sort: num(h.sort, 0), priority: Math.max(1, Math.round(num(h.priority, 99))),
      archived_at: h.archived_at || null, created_at: h.created_at || null
    };
  }

  function getHabits(opts) {
    opts = opts || {};
    var list = db.habits.filter(function (h) {
      if (h.archived_at && !opts.archived) return false;
      if (opts.goal_id && h.goal_id !== opts.goal_id) return false;
      if (opts.subgoal_id && h.subgoal_id !== opts.subgoal_id) return false;
      return true;
    });
    return list.sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || a.id - b.id; }).map(cleanHabit);
  }

  function addHabit(b) {
    var title = String(b.title || '').trim();
    if (!title) throw new Error('عنوان العادة مطلوب');
    var s = db.subgoals.find(function (x) { return x.id === Number(b.subgoal_id) && !x.archived_at; });
    if (!s) throw new Error('المهمة الفرعية غير موجودة');
    var days = (Array.isArray(b.days) ? b.days : []).map(Number).filter(function (x) { return x >= 0 && x <= 6; });
    var maxSort = db.habits.filter(function (h) { return h.subgoal_id === s.id; })
      .reduce(function (m, h) { return Math.max(m, h.sort || 0); }, 0);
    var h = {
      id: nextId(db.habits), title: title, icon: String(b.icon || ''), goal_id: s.goal_id, subgoal_id: s.id,
      minutes: Math.max(0, Math.round(num(b.minutes, 0))),
      days: days.join(','),
      week: Math.min(yearWeeks(), Math.max(1, Math.round(num(b.week, s.week)))),
      weeks: Math.max(1, Math.round(num(b.weeks, 1))),
      priority: Math.max(1, Math.round(num(b.priority, 99))),
      start_date: b.start_date || todayStr(), sort: maxSort + 1,
      archived_at: null, created_at: nowStamp()
    };
    db.habits.push(h);
    save();
    return cleanHabit(h);
  }

  function updateHabit(id, b) {
    var h = db.habits.find(function (x) { return x.id === id && !x.archived_at; });
    if (!h) throw new Error('العادة غير موجودة');
    if (b.title !== undefined) {
      var title = String(b.title || '').trim();
      if (!title) throw new Error('عنوان العادة مطلوب');
      h.title = title;
    }
    if (b.icon !== undefined) h.icon = String(b.icon || '');
    if (b.minutes !== undefined) h.minutes = Math.max(0, Math.round(num(b.minutes, 0)));
    if (b.days !== undefined) {
      var days = (Array.isArray(b.days) ? b.days : []).map(Number).filter(function (x) { return x >= 0 && x <= 6; });
      h.days = days.join(',');
    }
    if (b.week !== undefined) h.week = Math.min(yearWeeks(), Math.max(1, Math.round(num(b.week, 1))));
    if (b.weeks !== undefined) h.weeks = Math.max(1, Math.round(num(b.weeks, 1)));
    if (b.priority !== undefined) h.priority = Math.max(1, Math.round(num(b.priority, 99)));
    if (b.start_date !== undefined && b.start_date) h.start_date = String(b.start_date);
    save();
    return cleanHabit(h);
  }

  function archiveHabit(id) {
    var h = db.habits.find(function (x) { return x.id === id && !x.archived_at; });
    if (!h) throw new Error('العادة غير موجودة');
    h.archived_at = nowStamp();
    save();
  }

  /* ===== النشاط في أسبوع معيّن (سنة، أسبوع) =====
     الفروع النشطة في أسبوع: يُوزَّع كل هدف على سنوات ظهوره بتكديس مدد فروعه حسب
     الأولوية ابتداءً من أول سنة للهدف. لا يُظهر هذا القسم إلا الأهداف الظاهرة
     (النشطة) في تلك السنة — أي الهدف الأول غير المكتمل لكل قيمة، فلا تظهر أهداف
     نفس القيمة اللاحقة حتى يُكمل المستخدم الهدف السابق. توافق رجعي: إن لم تُحدَّد
     أي مدة (كل الفروع weeks <= 1) فتبقى فروع سنة الظهور نشطة كلها. */
  function activeBranchesForWeek(year, week) {
    var w = yearWeeks();
    var out = [];
    activeGoalsForYear(year).forEach(function (g) {
      var branches = branchSchedule(g.id);
      if (!branches.length) {
        out.push({ goal: g, branch: null });
        return;
      }
      var allDefault = branches.every(function (b) { return b.weeks <= 1; });
      if (allDefault) {
        branches.forEach(function (b) { out.push({ goal: g, branch: b }); });
        return;
      }
      var offset = (year - goalFirstYear(g)) * w + (week - 1);
      var cur = 0, hit = null;
      for (var i = 0; i < branches.length; i++) {
        if (offset >= cur && offset < cur + branches[i].weeks) { hit = branches[i]; break; }
        cur += branches[i].weeks;
      }
      if (hit) out.push({ goal: g, branch: hit });
    });
    return out;
  }

  function subgoalActiveThisWeek(subgoalId, year, week) {
    return activeBranchesForWeek(year, week).some(function (a) { return a.branch && a.branch.id === subgoalId; });
  }

  function activeForWeek(year, week) {
    var act = activeBranchesForWeek(year, week);
    var goals = act.map(function (a) { return a.goal; });
    var sids = [];
    act.forEach(function (a) { if (a.branch) sids.push(a.branch.id); });
    var habits = db.habits.filter(function (h) { return !h.archived_at && sids.indexOf(h.subgoal_id) >= 0 && weekWindow(h, week); });
    var projects = db.projects.filter(function (p) {
      return !p.archived_at && weekWindow(p, week) && (sids.indexOf(p.subgoal_id) >= 0 || !p.subgoal_id);
    });
    return { year: year, week: week, goals: goals, subs: act.map(function (a) { return a.branch; }).filter(Boolean), habits: habits, projects: projects };
  }

  function itemFromHabit(h) {
    return {
      key: 'h:' + h.id, kind: 'habit', id: h.id, title: h.title, icon: h.icon || '●',
      days: daysIn(h.days), week: h.week, weeks: h.weeks, start_date: h.start_date || '',
      minutes: h.minutes, goal_id: h.goal_id, subgoal_id: h.subgoal_id, color: null
    };
  }

  function itemFromProjectTask(p, pt) {
    return {
      key: 'p:' + pt.id, kind: 'ptask', id: pt.id, title: pt.title, icon: '',
      days: daysIn(pt.days), week: p.week, weeks: p.weeks, start_date: p.start_date || '',
      minutes: 0, goal_id: p.goal_id, subgoal_id: p.subgoal_id, color: p.color || DEFAULT_COLOR
    };
  }

  function collectItemsForRange(from, to) {
    var items = [], seen = {};
    var startYear = yearIndex(from), endYear = yearIndex(to);
    for (var y = startYear; y <= endYear; y++) {
      var w1 = (y === startYear) ? weekInYear(from) : 1;
      var w2 = (y === endYear) ? weekInYear(to) : yearWeeks();
      for (var w = w1; w <= w2; w++) {
        var act = activeForWeek(y, w);
        act.habits.forEach(function (h) {
          if (seen['h:' + h.id]) return;
          seen['h:' + h.id] = 1;
          items.push(itemFromHabit(h));
        });
        act.projects.forEach(function (p) {
          db.project_tasks.forEach(function (pt) {
            if (pt.project_id !== p.id || pt.archived_at || pt.completed_at) return;
            if (seen['p:' + pt.id]) return;
            seen['p:' + pt.id] = 1;
            items.push(itemFromProjectTask(p, pt));
          });
        });
      }
    }
    return items;
  }

  function weekWindowNum(w, n, week) {
    return week >= w && week <= w + n - 1;
  }

  function isScheduled(it, ds) {
    /* يوم العطلة الدوري: كل N أيام من بداية الخطة — تتوقف فيه المهام والترحيل */
    var every = num(db.settings.rest_day_every, 0);
    if (every > 0 && db.settings.life_start) {
      var d0 = new Date(String(db.settings.life_start).slice(0, 10) + 'T00:00:00Z');
      var d1 = new Date(ds + 'T00:00:00Z');
      if (!isNaN(d0) && !isNaN(d1)) {
        var diff = Math.round((d1 - d0) / 86400000);
        if (diff >= 0 && (diff % Math.round(every)) === 0) return false;
      }
    }
    if (it.days.indexOf(weekdayOf(ds)) === -1) return false;
    if (!weekWindowNum(it.week, it.weeks, weekInYear(ds))) return false;
    if (it.start_date && ds < it.start_date) return false;
    return true;
  }

  /* خريطة صفوف المهام في مدى زمني: المفتاح → {date → row} */
  function taskMapForRange(from, to) {
    var map = {};
    db.tasks.forEach(function (t) {
      if (t.archived_at) return;
      if (t.source !== 'habit' && t.source !== 'project') return;
      if (t.date < from || t.date > to) return;
      var k = (t.source === 'habit' ? 'h:' : 'p:') + t.src_id;
      if (!map[k]) map[k] = {};
      if (!map[k][t.date] || t.done) map[k][t.date] = t;
    });
    return map;
  }

  function cellState(it, ds, today, doneRow) {
    var scheduled = isScheduled(it, ds);
    if (!scheduled) return { k: 'empty' };
    if (doneRow && doneRow.done) return { k: 'done' };
    if (ds < today) return { k: it.kind === 'habit' ? 'miss' : 'pending' };
    return { k: 'today', id: doneRow ? doneRow.id : null };
  }

  /* ===== إحصائيات السنة (نسبة الاقتراب من الهدف) ===== */
  function yearStats(year) {
    year = Math.max(1, Math.round(num(year, 1)));
    var today = todayStr();
    var goals = db.goals.filter(function (g) { return !g.archived_at; });
    var habits = db.habits.filter(function (h) { return !h.archived_at; });
    var projects = db.projects.filter(function (p) { return !p.archived_at; });
    var totalExpected = 0, totalDone = 0;

    function countHabit(h, w) {
      var ws = weekStartDate(year, w), we = weekEndDate(year, w);
      var e = 0, dn = 0;
      for (var d = ws; d <= we && d <= today; d = addDays(d, 1)) {
        if (daysIn(h.days).indexOf(weekdayOf(d)) === -1) continue;
        if (h.start_date && d < h.start_date) continue;
        e++;
        var row = db.tasks.some(function (t) { return t.source === 'habit' && t.src_id === h.id && t.date === d && t.done && !t.archived_at; });
        if (row) dn++;
      }
      return { e: e, dn: dn };
    }

    function countProjectTask(pt, w, p) {
      var ws = weekStartDate(year, w), we = weekEndDate(year, w);
      var e = 0, dn = 0;
      for (var d = ws; d <= we && d <= today; d = addDays(d, 1)) {
        if (daysIn(pt.days).indexOf(weekdayOf(d)) === -1) continue;
        if (p.start_date && d < p.start_date) continue;
        e++;
        var row = db.tasks.some(function (t) { return t.source === 'project' && t.src_id === pt.id && t.date === d && t.done && !t.archived_at; });
        if (row) dn++;
      }
      return { e: e, dn: dn };
    }

    var perGoal = goals.map(function (g) {
      var gHabits = habits.filter(function (h) { return h.goal_id === g.id; });
      var gProjects = projects.filter(function (p) { return p.goal_id === g.id; });
      var ge = 0, gd = 0;
      for (var w = 1; w <= yearWeeks(); w++) {
        var act = activeBranchesForWeek(year, w);
        var activeSids = {};
        var goalActive = false;
        act.forEach(function (a) {
          if (a.goal.id !== g.id) return;
          goalActive = true;
          if (a.branch) activeSids[a.branch.id] = 1;
        });
        gHabits.forEach(function (h) {
          if (!weekWindow(h, w)) return;
          if (h.subgoal_id ? !activeSids[h.subgoal_id] : !goalActive) return;
          var c = countHabit(h, w);
          ge += c.e; gd += c.dn;
        });
        gProjects.forEach(function (p) {
          if (!weekWindow(p, w)) return;
          if (p.subgoal_id ? !activeSids[p.subgoal_id] : !goalActive) return;
          db.project_tasks.forEach(function (pt) {
            if (pt.project_id !== p.id || pt.archived_at) return;
            var c = countProjectTask(pt, w, p);
            ge += c.e; gd += c.dn;
          });
        });
      }
      totalExpected += ge; totalDone += gd;
      return { id: g.id, title: g.title, color: g.color, icon: g.icon, year: year, expected: ge, done: gd, pct: ge ? Math.round((gd / ge) * 100) : 0 };
    }).filter(function (x) { return x.expected > 0; });

    return {
      year: year, goals: perGoal,
      expected: totalExpected, done: totalDone,
      pct: totalExpected ? Math.round((totalDone / totalExpected) * 100) : 0,
      weeks: yearWeeks()
    };
  }

  /* ===== الأرشيف (بحث + فلترة + ترتيب زمني) ===== */
  function getArchive(filter) {
    filter = filter || {};
    var q = String(filter.q || '').trim().toLowerCase();
    var items = [];
    db.tasks.forEach(function (t) {
      if (!t.done && !t.archived_at) return;
      var type = t.source === 'habit' ? 'عادة' : (t.source === 'project' ? 'مهمة مشروع' : 'مهمة');
      items.push({ id: t.id, type: type, title: t.title, date: t.date, done: !!t.done, archived_at: t.archived_at || null, project_name: projectName(t.project_id), source: t.source });
    });
    db.projects.forEach(function (p) {
      if (!p.archived_at && !p.completed_at) return;
      items.push({ id: p.id, type: 'مشروع', title: p.name, date: (p.archived_at || p.completed_at || '').split('T')[0], done: true, archived_at: p.archived_at, completed_at: p.completed_at, project_name: p.name, source: 'project' });
    });
    db.habits.forEach(function (h) {
      if (!h.archived_at) return;
      items.push({ id: h.id, type: 'عادة', title: h.title, date: (h.archived_at || '').split('T')[0], done: true, archived_at: h.archived_at, project_name: null, source: 'habit' });
    });
    db.posts.forEach(function (p) {
      var spaceLabel = p.space === 'knowledge' ? 'معرفة' : (p.space === 'awareness' ? (p.sub === 'mem' ? 'ذكريات' : (p.sub === 'diary' ? 'يوميات' : 'تدوينة')) : 'تدوينة');
      items.push({ id: p.id, type: 'تدوينة', title: p.title || '(بلا عنوان)', date: String(p.created_at || '').slice(0, 10), done: !!p.completed_at, archived_at: p.archived_at || null, project_name: spaceLabel, source: 'post' });
    });
    if (q) items = items.filter(function (it) { return String(it.title || '').toLowerCase().indexOf(q) >= 0; });
    if (filter.type && filter.type !== 'all') items = items.filter(function (it) { return it.type === filter.type; });
    if (filter.year) items = items.filter(function (it) { return String(it.date).indexOf(String(filter.year) + '-') === 0; });
    items.sort(function (a, b) { return a.date === b.date ? 0 : (a.date < b.date ? 1 : -1); });
    return items;
  }

  function restoreTask(id) {
    var t = db.tasks.find(function (x) { return x.id === id; });
    if (!t) throw new Error('غير موجود');
    t.archived_at = null;
    save();
    return cleanTask(t);
  }

  /* ===== تاريخ اليوميات (وضع التاريخ في الأرشيف) =====
     كل ما أُدخل في النظام في مدى زمني، مجمّعًا حسب اليوم. */
  function historyRange(from, to) {
    var days = {};
    function D(ds) {
      if (!ds || ds < from || ds > to) return null;
      var d = days[ds];
      if (!d) { d = { date: ds, tasks: [], sessions: [], posts: [], notes: [], projects: [], archived: [], minutes: 0, total: 0, feelings: [], decisions: [], experiences: [], answers: [] }; days[ds] = d; }
      return d;
    }
    db.tasks.forEach(function (t) {
      if (t.date < from || t.date > to) return;
      var d = D(t.date);
      if (!d) return;
      d.tasks.push({ id: t.id, title: t.title, done: !!t.done, source: t.source, archived: !!t.archived_at, project_name: projectName(t.project_id), project_id: t.project_id ? num(t.project_id, null) : null, file: t.file || '', file_name: t.file_name || '' });
      d.total++;
    });
    db.sessions.forEach(function (s) {
      if (s.date < from || s.date > to) return;
      var d = D(s.date);
      if (!d) return;
      var mins = num(s.minutes, 0);
      var focus = (s.mode === 'pomodoro' || s.mode === 'focus') ? mins : 0;
      d.sessions.push({ mode: s.mode, minutes: mins, pname: projectName(s.project_id), note: s.note || '', project_id: s.project_id ? num(s.project_id, null) : null });
      d.minutes += focus;
      d.total++;
    });
    db.posts.forEach(function (p) {
      var ds = String(p.created_at || '').slice(0, 10);
      var d = D(ds);
      if (!d) return;
      d.posts.push({ id: p.id, title: p.title, space: p.space || '', sub: p.sub || '', media: p.media || [] });
      d.total++;
    });
    db.notes.forEach(function (n) {
      var ds = String(n.created_at || '').slice(0, 10);
      var d = D(ds);
      if (!d) return;
      d.notes.push({ text: n.text });
      d.total++;
    });
    db.projects.forEach(function (p) {
      var cds = p.completed_at ? String(p.completed_at).slice(0, 10) : null;
      var d = D(cds);
      if (d) { d.projects.push({ id: p.id, name: p.name, type: p.type || ' عام', file: p.file || '', file_name: p.file_name || '' }); d.total++; }
      var ads = p.archived_at ? String(p.archived_at).slice(0, 10) : null;
      d = D(ads);
      if (d) { d.archived.push({ id: p.id, name: p.name, type: p.type || 'عام', file: p.file || '', file_name: p.file_name || '' }); d.total++; }
    });
    db.habits.forEach(function (h) {
      var ads = h.archived_at ? String(h.archived_at).slice(0, 10) : null;
      var d = D(ads);
      if (d) { d.archived.push({ id: h.id, name: h.title, type: 'عادة' }); d.total++; }
    });
    /* المشاعر والقرارات والتجارب وإجابات الأسئلة — جزء كامل من ذاكرة كل يوم */
    (function () {
      var ls = journalStorage();
      if (!ls) return;
      var api = null;
      try { api = JSON.parse(ls.getItem('noor_local_api') || 'null'); } catch (e) { api = null; }
      function loadList(apiKey, legacyKey) {
        var out = [];
        if (api && Array.isArray(api[apiKey])) out = out.concat(api[apiKey]);
        var legacy;
        try { legacy = JSON.parse(ls.getItem(legacyKey) || 'null'); } catch (e) { legacy = null; }
        if (Array.isArray(legacy)) legacy.forEach(function (x) {
          if (x && !out.some(function (y) { return String(y.id) === String(x.id); })) out.push(x);
        });
        return out.filter(function (x) { return x && !x.archived_at; });
      }
      loadList('feelings', 'noor_feelings').forEach(function (f) {
        var ds = String(f.date || f.created_at || '').slice(0, 10);
        var d = D(ds);
        if (d) { d.feelings.push({ id: f.id, text: f.text }); d.total++; }
      });
      loadList('decisions', 'noor_decisions').forEach(function (x) {
        var ds = String(x.date || x.created_at || '').slice(0, 10);
        var d = D(ds);
        if (d) { d.decisions.push({ id: x.id, text: x.text }); d.total++; }
      });
      loadList('experiences', 'noor_experiences').forEach(function (x) {
        var ds = String(x.created_at || '').slice(0, 10);
        var d = D(ds);
        if (d) { d.experiences.push({ id: x.id, text: x.text, category_name: x.category_name || '' }); d.total++; }
      });
      for (var i = 0; i < ls.length; i++) {
        var k = ls.key(i);
        if (!k || k.indexOf(JOURNAL_PREFIX) !== 0) continue;
        var ds = k.substring(JOURNAL_PREFIX.length);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ds) || ds < from || ds > to) continue;
        var entry;
        try { entry = JSON.parse(ls.getItem(k)); } catch (e) { continue; }
        var d = D(ds);
        if (!d || !entry || !Array.isArray(entry.answers)) continue;
        entry.answers.forEach(function (a) {
          if (a && a.answer && String(a.answer).trim()) d.answers.push({ questionId: a.questionId, answer: a.answer });
        });
      }
    })();
    return Object.keys(days).sort().map(function (k) { return days[k]; });
  }

  function getDayHistory(ds) {
    var r = historyRange(ds, ds);
    return r[0] || { date: ds, tasks: [], sessions: [], posts: [], notes: [], projects: [], archived: [], minutes: 0, total: 0, feelings: [], decisions: [], experiences: [], answers: [] };
  }

  /* ===== عشوائيات الأهداف (أفكار سريعة مرتبطة بالأهداف) ===== */
  function getNotes() {
    return db.notes.filter(function (n) { return !n.archived_at; })
      .sort(function (a, b) { return (a.created_at || '') < (b.created_at || '') ? 1 : -1; })
      .map(function (n) { return { id: num(n.id, 0), text: n.text, created_at: n.created_at }; });
  }

  function addNote(text) {
    var t = String(text || '').trim();
    if (!t) throw new Error('اكتب الفكرة');
    var n = { id: nextId(db.notes), text: t, archived_at: null, created_at: nowStamp() };
    db.notes.push(n);
    save();
    return { id: n.id, text: n.text, created_at: n.created_at };
  }

  function archiveNote(id) {
    var n = db.notes.find(function (x) { return x.id === id && !x.archived_at; });
    if (!n) throw new Error('الفكرة غير موجودة');
    n.archived_at = nowStamp();
    save();
  }

  /* ===== التدوين الشامل (الوعي الذاتي، الالتزامات، المشاريع، تجميع المعرفة) ===== */
  function sanitizeSources(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (x) {
      return {
        type: String((x && x.type) || 'video'),
        title: String((x && x.title) || '').trim(),
        url: String((x && x.url) || '').trim()
      };
    }).filter(function (x) { return x.title || x.url; });
  }
  function cleanSources(s) {
    try { var a = JSON.parse(s || '[]'); return sanitizeSources(a); } catch (e) { return []; }
  }

  function cleanPostSteps(steps) {
    try {
      var a = JSON.parse(steps || '[]');
      if (!Array.isArray(a)) return [];
      return a.map(function (s) { return { text: String((s && s.text) || ''), done: !!(s && s.done) }; });
    } catch (e) { return []; }
  }

  function cleanPost(p) {
    return {
      id: num(p.id, 0), space: p.space || '', sub: p.sub || '', title: p.title || '', text: p.text || '',
      cover: p.cover || '',
      link: p.link || '',
      author: p.author || '',
      rating: p.rating !== undefined && p.rating !== null && p.rating !== '' ? Math.min(5, Math.max(0, Number(p.rating))) : 0,
      steps: cleanPostSteps(p.steps), completed_at: p.completed_at || null,
      tags: (function() { try { return Array.isArray(p.tags) ? p.tags : (typeof p.tags === 'string' ? JSON.parse(p.tags) : []); } catch(e) { return []; } })(),
      created_at: p.created_at || null, updated_at: p.updated_at || null,
      archived_at: p.archived_at || null
    };
  }

  function getPosts(space) {
    return db.posts.filter(function (p) { return !p.archived_at && (!space || p.space === space); })
      .sort(function (a, b) { return String(b.updated_at || b.created_at || '') < String(a.updated_at || a.created_at || '') ? -1 : 1; })
      .map(cleanPost);
  }

  function getPost(id) {
    var p = db.posts.find(function (x) { return x.id === id && !x.archived_at; });
    return p ? cleanPost(p) : null;
  }

  function getPostAny(id) {
    var p = db.posts.find(function (x) { return x.id === id; });
    return p ? cleanPost(p) : null;
  }

  function getAllPosts() {
    return db.posts.filter(function (p) { return !p.archived_at; })
      .map(cleanPost)
      .sort(function (a, b) { return String(b.updated_at || b.created_at || '') < String(a.updated_at || a.created_at || '') ? -1 : 1; });
  }

  function addPost(b) {
    var space = String(b.space || '').trim();
    var title = String(b.title || '').trim();
    if (!title) throw new Error('عنوان التدوينة مطلوب');
    var ts = nowStamp();
    var steps = Array.isArray(b.steps) ? b.steps.map(function (s) { return { text: String((s && s.text) || ''), done: !!(s && s.done) }; }) : [];
    var tags = Array.isArray(b.tags) ? b.tags.slice() : [];
    var p = {
      id: nextId(db.posts), space: space, sub: String(b.sub || ''), title: title, text: String(b.text || ''),
      cover: String(b.cover || ''),
      link: String(b.link || ''),
      author: String(b.author || ''),
      rating: b.rating !== undefined && b.rating !== null && b.rating !== '' ? Math.min(5, Math.max(0, Number(b.rating))) : 0,
      steps: JSON.stringify(steps), tags: JSON.stringify(tags), completed_at: null,
      archived_at: null, created_at: ts, updated_at: ts
    };
    db.posts.push(p);
    save();
    return cleanPost(p);
  }

  function updatePost(id, b) {
    var p = db.posts.find(function (x) { return x.id === id && !x.archived_at; });
    if (!p) throw new Error('التدوينة غير موجودة');
    if (b.title !== undefined) {
      var title = String(b.title || '').trim();
      if (!title) throw new Error('عنوان التدوينة مطلوب');
      p.title = title;
    }
    if (b.text !== undefined) p.text = String(b.text || '');
    if (b.sub !== undefined) p.sub = String(b.sub || '');
    if (b.cover !== undefined) p.cover = String(b.cover || '');
    if (b.link !== undefined) p.link = String(b.link || '');
    if (b.author !== undefined) p.author = String(b.author || '');
    if (b.rating !== undefined && b.rating !== null && b.rating !== '') p.rating = Math.min(5, Math.max(0, Number(b.rating)));
    if (b.steps !== undefined) p.steps = JSON.stringify(Array.isArray(b.steps) ? b.steps.map(function (s) { return { text: String((s && s.text) || ''), done: !!(s && s.done) }; }) : []);
    if (b.tags !== undefined) p.tags = JSON.stringify(Array.isArray(b.tags) ? b.tags : []);
    if (b.completed_at !== undefined) p.completed_at = b.completed_at ? nowStamp() : null;
    p.updated_at = nowStamp();
    save();
    return cleanPost(p);
  }

  function archivePost(id) {
    var p = db.posts.find(function (x) { return x.id === id && !x.archived_at; });
    if (!p) throw new Error('التدوينة غير موجودة');
    p.archived_at = nowStamp();
    save();
  }

  /* ===== الإعدادات ===== */
  function getSettings() {
    return Object.assign({}, db.settings);
  }

  function updateSettings(b) {
    for (var k in b) if (b.hasOwnProperty(k)) db.settings[k] = String(b[k]);
    save();
    return getSettings();
  }

  /* ===== الإحصائيات ===== */
  function stats() {
    var today = todayStr();
    var ws = weekStartDate(yearIndex(today), weekInYear(today));
    var s = db.settings;
    var weeklyTarget = num(s.weekly_target_min, 1200);
    var dailyTarget = num(s.daily_target_min, 180);
    var dailyThreshold = num(s.daily_threshold, 50);
    var rewardThreshold = num(s.reward_threshold, 80);
    var sentences = [];
    try { sentences = JSON.parse(s.sentences || '[]'); } catch (e) { sentences = []; }

    var isWork = function (x) { return x.mode === 'pomodoro' || x.mode === 'focus'; };
    var allSessions = db.sessions.filter(function (x) { return x.date <= today; });
    var weekSessions = allSessions.filter(function (x) { return x.date >= ws && x.date <= today; });
    var focusWeek = weekSessions.filter(isWork).reduce(function (a, x) { return a + x.minutes; }, 0);
    var pct = weeklyTarget > 0 ? Math.min(200, Math.round((focusWeek / weeklyTarget) * 100)) : 0;
    var sentenceIdx = Math.min(24, Math.max(0, Math.floor(pct / 4)));
    var sentence = sentences[sentenceIdx] || sentences[0] || '';

    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = addDays(ws, i);
      var fmin = allSessions.filter(function (x) { return x.date === d && isWork(x); })
        .reduce(function (a, x) { return a + x.minutes; }, 0);
      var dpct = dailyTarget > 0 ? Math.round((fmin / dailyTarget) * 100) : 0;
      days.push({ date: d, label: WEEKDAYS[weekdayOf(d)], focus_min: fmin, pct: dpct, ok: d < today ? dpct >= dailyThreshold : null, isToday: d === today });
    }

    var elapsed = dayDiff(ws, today) + 1;
    var avgFocusMin = Math.round(focusWeek / elapsed);

    var weekTasks = db.tasks.filter(function (t) { return t.date >= ws && t.date <= today && !t.archived_at; });
    var tasksDone = weekTasks.filter(function (t) { return t.done; }).length;
    var tasksTotal = weekTasks.length;
    var tasksPct = tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : 0;

    var prevWeeks = {};
    allSessions.forEach(function (x) {
      if (!isWork(x)) return;
      var w = weekStartDate(yearIndex(x.date), weekInYear(x.date));
      if (w >= ws) return;
      prevWeeks[w] = (prevWeeks[w] || 0) + x.minutes;
    });
    var weeksArr = Object.keys(prevWeeks);
    var avgPct = weeksArr.length
      ? Math.round(weeksArr.reduce(function (a, w) { return a + (weeklyTarget ? Math.min(100, (prevWeeks[w] / weeklyTarget) * 100) : 0); }, 0) / weeksArr.length)
      : 0;

    var deepTotal = focusWeek;
    var byProject = {};
    weekSessions.forEach(function (x) {
      if (!isWork(x)) return;
      var k = x.project_id ? String(x.project_id) : 'غير مرتبط';
      byProject[k] = (byProject[k] || 0) + x.minutes;
    });
    var deep = {
      total_min: deepTotal,
      byProject: Object.keys(byProject).map(function (k) {
        var name = 'مشروع محذوف';
        if (k === 'غير مرتبط') name = 'غير مرتبط بمشروع';
        else {
          var p = db.projects.find(function (x) { return x.id === Number(k); });
          if (p) name = p.name;
        }
        return {
          project_id: k === 'غير مرتبط' ? null : Number(k),
          name: name,
          minutes: byProject[k],
          pct: deepTotal ? Math.round((byProject[k] / deepTotal) * 100) : 0
        };
      }).sort(function (a, b) { return b.minutes - a.minutes; })
    };

    var desires = db.desires.filter(function (d) { return !d.archived_at; })
      .sort(function (a, b) { return b.id - a.id; })
      .map(function (d) {
        return { id: num(d.id, 0), text: d.text, target_pct: num(d.target_pct, 80), week_start: d.week_start || null, current_pct: tasksPct, achieved: tasksPct >= num(d.target_pct, 80) };
      });

    return {
      date: today, week_start: ws,
      focus_min: focusWeek, target_min: weeklyTarget, pct: pct, sentence: sentence, sentence_idx: sentenceIdx,
      days: days, daily_threshold: dailyThreshold,
      tasks_done: tasksDone, tasks_total: tasksTotal, tasks_pct: tasksPct,
      avg_focus_min: avgFocusMin, avg_pct: avgPct, elapsed_days: elapsed,
      deep: deep,
      reward: { threshold: rewardThreshold, achieved: tasksPct >= rewardThreshold },
      desires: desires
    };
  }

  /* ===== النسخ الاحتياطي ===== */
  function dump() {
    var journalData = {};
    var ls = journalStorage();
    if (ls) {
      var qRaw = ls.getItem(JOURNAL_QKEY);
      if (qRaw) {
        try { journalData.questions = JSON.parse(qRaw); } catch (e) { journalData.questions = undefined; }
      }
      var journalEntries = {};
      for (var i = 0; i < ls.length; i++) {
        var key = ls.key(i);
        if (key && key.indexOf(JOURNAL_PREFIX) === 0) {
          var datePart = key.substring(JOURNAL_PREFIX.length);
          if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
            try { journalEntries[datePart] = JSON.parse(ls.getItem(key)); } catch (e) {}
          }
        }
      }
      journalData.entries = journalEntries;
      var feelingsRaw = ls.getItem('noor_feelings');
      if (feelingsRaw) try { journalData.feelings = JSON.parse(feelingsRaw); } catch (e) {}
      var decisionsRaw = ls.getItem('noor_decisions');
      if (decisionsRaw) try { journalData.decisions = JSON.parse(decisionsRaw); } catch (e) {}
      var expRaw = ls.getItem('noor_experiences');
      if (expRaw) try { journalData.experiences = JSON.parse(expRaw); } catch (e) {}
    }
    var barrierDone = {};
    for (var j = 0; j < (ls ? ls.length : 0); j++) {
      var k = ls.key(j);
      if (k && k.indexOf('noor_barrier_done_') === 0) {
        var dd = k.substring('noor_barrier_done_'.length);
        barrierDone[dd] = ls.getItem(k);
      }
    }
    var shDone = {};
    for (var m = 0; m < (ls ? ls.length : 0); m++) {
      var kk = ls.key(m);
      if (kk && kk.indexOf('noor_sh_done_') === 0) {
        shDone[kk] = ls.getItem(kk);
      }
    }
    var rewardClaims = {};
    for (var n = 0; n < (ls ? ls.length : 0); n++) {
      var rk = ls.key(n);
      if (rk && rk.indexOf('noor_reward_claims_') === 0) rewardClaims[rk] = ls.getItem(rk);
    }
    var sessionTasks = null;
    try { sessionTasks = ls ? ls.getItem('noor_session_tasks_v1') : null; } catch (e) {}
    /* المخزن المحلي الموحد (واجهة API المحلية): مشاعر/قرارات/تجارب/تصنيفات/حالة التحدي/سجلات العادات */
    var apiDb = null;
    try { apiDb = JSON.parse(ls.getItem('noor_local_api') || 'null'); } catch (e) { apiDb = null; }
    return {
      app: 'noor', version: 2, exported_at: new Date().toISOString(),
      data: {
        settings: Object.assign({}, db.settings),
        projects: db.projects.map(function (x) { return Object.assign({}, x); }),
        project_tasks: db.project_tasks.map(function (x) { return Object.assign({}, x); }),
        tasks: db.tasks.map(function (x) { return Object.assign({}, x); }),
        sessions: db.sessions.map(function (x) { return Object.assign({}, x); }),
        desires: db.desires.map(function (x) { return Object.assign({}, x); }),
        goals: db.goals.map(function (x) { return Object.assign({}, x); }),
        values: db.values.map(function (x) { return Object.assign({}, x); }),
        subgoals: db.subgoals.map(function (x) { return Object.assign({}, x); }),
        habits: db.habits.map(function (x) { return Object.assign({}, x); }),
        simple_habits: (db.simple_habits || []).map(function (x) { return Object.assign({}, x); }),
        barrier_tasks: (db.barrier_tasks || []).map(function (x) { return Object.assign({}, x); }),
        barrier_hosts: (db.barrier_hosts || []).map(function (x) { return Object.assign({}, x); }),
        notes: db.notes.map(function (x) { return Object.assign({}, x); }),
        posts: db.posts.map(function (x) { return Object.assign({}, x); }),
        challenges: (db.challenges || []).map(function (x) { return Object.assign({}, x, { done_dates: (x.done_dates || []).slice() }); }),
        journal: journalData,
        barrier_done: barrierDone,
        simple_habit_done: shDone,
        reward_claims: rewardClaims,
        session_tasks: sessionTasks,
        api: apiDb && typeof apiDb === 'object' ? apiDb : null
      }
    };
  }

  function factoryReset() {
    /* إعادة ضبط حقيقية: لا تُبقي إعدادات أو معرّفات مشاريع قديمة بعد مسح الخطة. */
    /* مسح كل البيانات */
    db.projects = [];
    db.project_tasks = [];
    db.tasks = [];
    db.sessions = [];
    db.desires = [];
    db.goals = [];
    db.values = [];
    db.subgoals = [];
    db.habits = [];
    db.simple_habits = [];
    db.barrier_tasks = [];
    db.barrier_hosts = [];
    db.notes = [];
    db.posts = [];
    db.experiences = [];
    db.exp_categories = [];
    db.challenges = [];
    db.settings = Object.assign({}, DEFAULTS);
    /* مسح بيانات اليومية من localStorage */
    var ls = journalStorage();
    if (ls) {
      var keysToRemove = [];
      for (var i = 0; i < ls.length; i++) {
        var key = ls.key(i);
        if (key && key !== 'noor_factory_reset_backup' && (key.indexOf('noor_') === 0 || key.indexOf('noor_journal') === 0)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(function (k) { ls.removeItem(k); });
    }
    save();
    return true;
  }

  /* حقول كل جدول تُسمح بها النسخة الاحتياطية — تُنظَّف عند الاستعادة لمنع حقن كود/أرقام شاذة */
  var RESTORE_SCHEMA = {
    projects: ['id', 'name', 'notes', 'link', 'video_url', 'color', 'active', 'sort', 'priority', 'type', 'cover', 'author', 'rating', 'summary', 'file_name', 'file', 'goal_id', 'subgoal_id', 'week', 'weeks', 'start_date', 'days', 'archived_at', 'completed_at', 'created_at'],
    project_tasks: ['id', 'project_id', 'title', 'desc', 'days', 'hours', 'sources', 'sort', 'completed_at', 'archived_at', 'created_at'],
    tasks: ['id', 'date', 'title', 'desc', 'project_id', 'source', 'src_id', 'done', 'carried', 'sort', 'archived_at', 'created_at'],
    sessions: ['id', 'date', 'mode', 'minutes', 'project_id', 'note', 'created_at'],
    desires: ['id', 'text', 'week_start', 'target_pct', 'achieved', 'status', 'week_start_date', 'archived_at', 'created_at'],
    goals: ['id', 'title', 'color', 'icon', 'year', 'years', 'duration_years', 'value_id', 'details', 'duration_type', 'completed_at', 'sort', 'archived_at', 'created_at'],
    values: ['id', 'title', 'icon', 'color', 'sort', 'priority', 'archived_at', 'created_at'],
    subgoals: ['id', 'goal_id', 'title', 'week', 'priority', 'weeks', 'sort', 'archived_at', 'created_at'],
    habits: ['id', 'title', 'icon', 'goal_id', 'subgoal_id', 'minutes', 'days', 'week', 'weeks', 'start_date', 'sort', 'priority', 'archived_at', 'created_at'],
    simple_habits: ['id', 'title', 'allowed_days', 'active', 'sort', 'archived_at', 'created_at'],
    barrier_tasks: ['id', 'title', 'category', 'active', 'sort', 'archived_at', 'created_at'],
    barrier_hosts: ['id', 'title', 'active', 'sort', 'archived_at', 'created_at'],
    notes: ['id', 'text', 'archived_at', 'created_at'],
    posts: ['id', 'space', 'sub', 'title', 'text', 'cover', 'link', 'author', 'rating', 'steps', 'tags', 'completed_at', 'archived_at', 'created_at', 'updated_at']
  };
  /* جدول التحديات يُنظَّف يدويًا في restore() لأن done_dates مصفوفة نصوص تواريخ */
  var RESTORE_NUM = ['id', 'project_id', 'src_id', 'goal_id', 'subgoal_id', 'value_id', 'sort', 'priority', 'week', 'weeks', 'minutes', 'target_pct', 'year', 'done', 'carried', 'active', 'hours'];
  /* حقول مصفوفات أرقام (مثل سنوات الهدف المتعددة) — تُستعاد كما هي كأرقام لا نص «2,3» */
  var RESTORE_NUM_ARRAY = ['years'];

  function cleanRestoreRows(list, table) {
    if (!Array.isArray(list)) return [];
    var fields = RESTORE_SCHEMA[table] || [];
    return list.map(function (r) {
      if (!r || typeof r !== 'object') return null;
      var o = {};
      for (var i = 0; i < fields.length; i++) {
        var k = fields[i];
        if (r[k] === undefined) continue;
        if (RESTORE_NUM_ARRAY.indexOf(k) >= 0) {
          o[k] = (Array.isArray(r[k]) ? r[k] : String(r[k] == null ? '' : r[k]).split(','))
            .map(function (n) { return parseInt(n, 10) || 0; }).filter(function (n) { return n > 0; });
          continue;
        }
        o[k] = RESTORE_NUM.indexOf(k) >= 0 ? num(r[k], 0) : (r[k] == null ? null : (typeof r[k] === 'string' ? r[k] : String(r[k])));
      }
      return o;
    }).filter(function (o) { return o !== null; });
  }

  function restore(data) {
    if (!data || data.app !== 'noor' || !data.data || !data.data.settings) throw new Error('ملف نسخة غير صالح');
    var d = data.data;
    /* الاستعادة استبدال كامل للحالة: لا نخلط السجلات الجديدة مع نسخة أقدم. */
    function table(key) {
      return cleanRestoreRows(Array.isArray(d[key]) ? d[key] : [], key);
    }
    db = {
      settings: Object.assign({}, DEFAULTS),
      projects: table('projects'),
      project_tasks: table('project_tasks'),
      tasks: table('tasks'),
      sessions: table('sessions'),
      desires: table('desires'),
      goals: table('goals'),
      values: table('values'),
      subgoals: table('subgoals'),
      habits: table('habits'),
      simple_habits: table('simple_habits'),
      barrier_tasks: table('barrier_tasks'),
      barrier_hosts: table('barrier_hosts'),
      notes: table('notes'),
      posts: table('posts'),
      challenges: (Array.isArray(d.challenges) ? d.challenges : [])
        .map(function (c) { return c && typeof c === 'object' ? cleanChallenge(c) : null; })
        .filter(function (c) { return c && c.title; }),
      experiences: [],
      exp_categories: []
    };
    for (var k in DEFAULTS) {
      if (d.settings && d.settings[k] !== undefined) db.settings[k] = String(d.settings[k]);
      else db.settings[k] = DEFAULTS[k];
    }

    var ls = journalStorage();
    if (ls) {
      /* امسح النسخة الجانبية السابقة قبل تحميل الجديدة، مع حماية نسخة استرداد إعادة الضبط وتفضيل الشريط الجانبي. */
      var removeKeys = [];
      for (var i = 0; i < ls.length; i++) {
        var key = ls.key(i);
        if (!key || key === 'noor_db_v1' || key === 'noor_factory_reset_backup' ||
            key === 'noor_hide_sidebar' || key === 'noor_merged_v1') continue;
        if (key === JOURNAL_QKEY || key.indexOf(JOURNAL_PREFIX) === 0 ||
            key === 'noor_feelings' || key === 'noor_decisions' || key === 'noor_experiences' ||
            key.indexOf('noor_barrier_done_') === 0 || key.indexOf('noor_sh_done_') === 0 ||
            key.indexOf('noor_barrier_host_') === 0 || key.indexOf('noor_reward_claims_') === 0 ||
            key === 'noor_session_tasks_v1' || key === 'noor_local_api' ||
            key === 'noor_last_change' || key === 'noor_dirty') {
          removeKeys.push(key);
        }
      }
      removeKeys.forEach(function (key) { ls.removeItem(key); });

      if (d.journal && typeof d.journal === 'object') {
        if (Array.isArray(d.journal.questions)) ls.setItem(JOURNAL_QKEY, JSON.stringify(d.journal.questions));
        if (d.journal.entries && typeof d.journal.entries === 'object') {
          Object.keys(d.journal.entries).forEach(function (dateKey) {
            if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateKey)) {
              ls.setItem(JOURNAL_PREFIX + dateKey, JSON.stringify(d.journal.entries[dateKey]));
            }
          });
        }
        ['feelings', 'decisions', 'experiences'].forEach(function (kind) {
          if (Array.isArray(d.journal[kind])) ls.setItem('noor_' + kind, JSON.stringify(d.journal[kind]));
        });
      }
      if (d.barrier_done && typeof d.barrier_done === 'object') {
        Object.keys(d.barrier_done).forEach(function (dateKey) {
          if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateKey)) {
            ls.setItem('noor_barrier_done_' + dateKey, String(d.barrier_done[dateKey]));
          }
        });
      }
      if (d.simple_habit_done && typeof d.simple_habit_done === 'object') {
        Object.keys(d.simple_habit_done).forEach(function (key) {
          if (key.indexOf('noor_sh_done_') === 0) ls.setItem(key, String(d.simple_habit_done[key]));
        });
      }
      if (d.reward_claims && typeof d.reward_claims === 'object') {
        Object.keys(d.reward_claims).forEach(function (key) {
          if (key.indexOf('noor_reward_claims_') === 0) ls.setItem(key, String(d.reward_claims[key]));
        });
      }
      if (typeof d.session_tasks === 'string' && d.session_tasks) {
        ls.setItem('noor_session_tasks_v1', d.session_tasks);
      }
      /* المخزن المحلي الموحد: استرجع النسخة كاملة، أو أنشئ مخزنًا نظيفًا لنسخ الإصدارات القديمة. */
      var apiSnapshot = d.api && typeof d.api === 'object' ? d.api : {};
      if (!(d.api && typeof d.api === 'object') && d.journal) {
        ['feelings', 'decisions', 'experiences'].forEach(function (kind) {
          if (Array.isArray(d.journal[kind])) apiSnapshot[kind] = d.journal[kind].slice();
        });
      }
      ls.setItem('noor_local_api', JSON.stringify(apiSnapshot));
    }
    /* اكتب اللقطة بعد تحميل كل الجداول الجانبية حتى لا تُدفع نسخة ناقصة إلى الخادم. */
    save();
  }

  function archiveAll() {
    var now = new Date().toISOString();
    db.tasks.forEach(function(t) { if (!t.archived_at) t.archived_at = now; });
    db.projects.forEach(function(p) { if (!p.archived_at) p.archived_at = now; });
    db.project_tasks.forEach(function(t) { if (!t.archived_at) t.archived_at = now; });
    db.goals.forEach(function(g) { if (!g.archived_at) g.archived_at = now; });
    db.values.forEach(function(v) { if (!v.archived_at) v.archived_at = now; });
    db.subgoals.forEach(function(s) { if (!s.archived_at) s.archived_at = now; });
    db.habits.forEach(function(h) { if (!h.archived_at) h.archived_at = now; });
    db.simple_habits.forEach(function(h) { if (!h.archived_at) h.archived_at = now; });
    db.notes.forEach(function(n) { if (!n.archived_at) n.archived_at = now; });
    db.posts.forEach(function(p) { if (!p.archived_at) p.archived_at = now; });
    db.desires.forEach(function(d) { if (!d.archived_at) d.archived_at = now; });
    db.barrier_tasks.forEach(function(t) { if (!t.archived_at) t.archived_at = now; });
    db.barrier_hosts.forEach(function(h) { if (!h.archived_at) h.archived_at = now; });
    (db.challenges || []).forEach(function(c) { if (!c.archived_at) c.archived_at = now; });
    save();
  }

  function restoreProject(id) {
    var p = db.projects.find(function(x) { return x.id === id; });
    if (!p) throw new Error('غير موجود');
    p.archived_at = null;
    db.project_tasks.filter(function(t) { return t.project_id === id; }).forEach(function(t) { t.archived_at = null; });
    db.tasks.filter(function(t) { return t.project_id === id; }).forEach(function(t) { t.archived_at = null; });
    save();
  }

  function restoreProjectTask(id) {
    var t = db.project_tasks.find(function(x) { return x.id === id; });
    if (!t) throw new Error('غير موجود');
    t.archived_at = null;
    save();
  }

  function restoreGoal(id) {
    var g = db.goals.find(function(x) { return x.id === id; });
    if (!g) throw new Error('غير موجود');
    g.archived_at = null;
    save();
  }

  function restoreValue(id) {
    var v = db.values.find(function(x) { return x.id === id; });
    if (!v) throw new Error('غير موجود');
    v.archived_at = null;
    save();
  }

  function restoreSubgoal(id) {
    var s = db.subgoals.find(function(x) { return x.id === id; });
    if (!s) throw new Error('غير موجود');
    s.archived_at = null;
    save();
  }

  function restoreHabit(id) {
    var h = db.habits.find(function(x) { return x.id === id; });
    if (!h) throw new Error('غير موجود');
    h.archived_at = null;
    save();
  }

  function restoreNote(id) {
    var n = db.notes.find(function(x) { return x.id === id; });
    if (!n) throw new Error('غير موجود');
    n.archived_at = null;
    save();
  }

  function restorePost(id) {
    var p = db.posts.find(function(x) { return x.id === id; });
    if (!p) throw new Error('غير موجود');
    p.archived_at = null;
    save();
  }

  function restoreDesire(id) {
    var d = db.desires.find(function(x) { return x.id === id; });
    if (!d) throw new Error('غير موجود');
    d.archived_at = null;
    save();
  }

  function restoreSimpleHabit(id) {
    var h = db.simple_habits.find(function(x) { return x.id === id; });
    if (!h) throw new Error('غير موجود');
    h.archived_at = null;
    save();
  }

  function reset() {
    archiveAll();
  }

  /* ===== يوميات اليوم (Journal) — مخزن محلي مستقل ===== */
  var JOURNAL_QKEY = 'noor_journal_questions';
  var JOURNAL_PREFIX = 'noor_journal_';
  var JOURNAL_DEFAULTS = [
    { id: 1, text: 'ما الذي أشكر الله عليه اليوم؟', category: 'gratitude', type: 'general', sub: '' },
    { id: 2, text: 'كيف أشعر اليوم؟', category: 'reflection', type: 'feeling', sub: '' },
    { id: 3, text: 'ما الذي تعلمته اليوم؟', category: 'learning', type: 'experience', sub: '' },
    { id: 4, text: 'هل اتخذت قراراً مهماً اليوم؟', category: 'planning', type: 'decision', sub: '' },
    { id: 5, text: 'ما الذي أريد تحسينه في نفسي؟', category: 'growth', type: 'general', sub: '' }
  ];

  function journalStorage() { return global.localStorage; }

  function getJournalQuestions() {
    var ls = journalStorage();
    if (!ls) return JOURNAL_DEFAULTS.slice();
    var raw = ls.getItem(JOURNAL_QKEY);
    if (!raw) return JOURNAL_DEFAULTS.slice();
    try { var q = JSON.parse(raw); return Array.isArray(q) && q.length ? q : JOURNAL_DEFAULTS.slice(); }
    catch (e) { return JOURNAL_DEFAULTS.slice(); }
  }

  function saveJournalQuestions(questions) {
    var ls = journalStorage();
    if (!ls || !Array.isArray(questions)) return;
    ls.setItem(JOURNAL_QKEY, JSON.stringify(questions));
  }

  function getTodayJournal(dateStr) {
    var d = dateStr || todayStr();
    var ls = journalStorage();
    var empty = { date: d, answers: [], completed: false };
    if (!ls) return empty;
    var raw = ls.getItem(JOURNAL_PREFIX + d);
    if (!raw) return empty;
    try {
      var obj = JSON.parse(raw);
      if (obj && obj.date === d && Array.isArray(obj.answers)) return obj;
      return empty;
    } catch (e) { return empty; }
  }

  function saveJournalAnswer(questionId, answer, dateStr) {
    var d = dateStr || todayStr();
    var ls = journalStorage();
    if (!ls) return;
    var journal = getTodayJournal(d);
    var found = false;
    for (var i = 0; i < journal.answers.length; i++) {
      if (journal.answers[i].questionId === questionId) {
        journal.answers[i].answer = answer;
        journal.answers[i].ts = nowStamp();
        found = true;
        break;
      }
    }
    if (!found) {
      journal.answers.push({ questionId: questionId, answer: answer, ts: nowStamp() });
    }
    ls.setItem(JOURNAL_PREFIX + d, JSON.stringify(journal));
    touchSync();
    if (!answer || !answer.trim()) return;
    var qs = getJournalQuestions();
    var q = qs.find(function (x) { return x.id === questionId; });
    if (!q || !q.type || q.type === 'general') return;
    /* النسخ التلقائي الموحد: يُسلَّم للطبقة العليا لتخزينه في المخزن الوحيد المعروض */
    try { if (typeof global.NoorTypedAnswerHook === 'function') global.NoorTypedAnswerHook(q, answer.trim(), d); } catch (e) {}
  }

  function completeJournal(dateStr) {
    var d = dateStr || todayStr();
    var ls = journalStorage();
    if (!ls) return;
    var journal = getTodayJournal(d);
    journal.completed = true;
    ls.setItem(JOURNAL_PREFIX + d, JSON.stringify(journal));
    touchSync();
  }

  function getJournalHistory() {
    var ls = journalStorage();
    if (!ls) return [];
    var dates = [];
    for (var i = 0; i < ls.length; i++) {
      var key = ls.key(i);
      if (key && key.indexOf(JOURNAL_PREFIX) === 0) {
        var datePart = key.substring(JOURNAL_PREFIX.length);
        if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) dates.push(datePart);
      }
    }
    dates.sort();
    return dates;
  }

  /* ===== العادات البسيطة (المودال — غير مرتبطة بالأهداف) ===== */
  function getSimpleHabits() {
    return (db.simple_habits || []).filter(function (h) { return !h.archived_at; })
      .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || a.id - b.id; });
  }

  function addSimpleHabit(b) {
    var title = String(b.title || '').trim();
    if (!title) throw new Error('العنوان مطلوب');
    var allowed_days = Array.isArray(b.allowed_days) ? b.allowed_days : [];
    var maxSort = (db.simple_habits || []).reduce(function (m, h) { return Math.max(m, h.sort || 0); }, 0);
    var h = {
      id: nextId(db.simple_habits), title: title, allowed_days: JSON.stringify(allowed_days),
      active: 1, sort: maxSort + 1, archived_at: null, created_at: nowStamp()
    };
    if (!db.simple_habits) db.simple_habits = [];
    db.simple_habits.push(h);
    save();
    return h;
  }

  function updateSimpleHabit(id, b) {
    var h = (db.simple_habits || []).find(function (x) { return x.id === id && !x.archived_at; });
    if (!h) throw new Error('العادة غير موجودة');
    if (b.title !== undefined) h.title = String(b.title || '').trim();
    if (b.allowed_days !== undefined) h.allowed_days = JSON.stringify(b.allowed_days);
    save();
    return h;
  }

  function archiveSimpleHabit(id) {
    var h = (db.simple_habits || []).find(function (x) { return x.id === id && !x.archived_at; });
    if (!h) throw new Error('العادة غير موجودة');
    h.archived_at = nowStamp();
    save();
  }

  function getTodaySimpleHabits() {
    var today = todayStr();
    var wd = weekdayOf(today);
    var dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    var keyForDay = dayKeys[wd];
    return getSimpleHabits().filter(function (h) {
      var days = [];
      try { days = JSON.parse(h.allowed_days || '[]'); } catch (e) {}
      return !days.length || days.indexOf(keyForDay) >= 0;
    });
  }

  function toggleSimpleHabitDone(id, dateStr, done) {
    var key = 'noor_sh_done_' + id + '_' + (dateStr || todayStr());
    try {
      if (done) localStorage.setItem(key, '1');
      else localStorage.removeItem(key); /* حذف بدل دفنة '0' — لا نموّ بلا حدود في التخزين */
    } catch (e) {}
    touchSync();
  }

  function isSimpleHabitDone(id, dateStr) {
    var key = 'noor_sh_done_' + id + '_' + (dateStr || todayStr());
    try { return localStorage.getItem(key) === '1'; } catch (e) { return false; }
  }

  /* ===== كسر الحواجز (بيانات محلية) ===== */
  function getBarrierTasks() {
    return (db.barrier_tasks || []).filter(function (t) { return !t.archived_at; })
      .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || a.id - b.id; });
  }

  function addBarrierTask(b) {
    var title = String(b.title || '').trim();
    if (!title) throw new Error('العنوان مطلوب');
    var maxSort = (db.barrier_tasks || []).reduce(function (m, t) { return Math.max(m, t.sort || 0); }, 0);
    var t = {
      id: nextId(db.barrier_tasks), title: title, category: String(b.category || ''),
      active: 1, sort: maxSort + 1, archived_at: null, created_at: nowStamp()
    };
    if (!db.barrier_tasks) db.barrier_tasks = [];
    db.barrier_tasks.push(t);
    save();
    return t;
  }

  function reorderBarrierTasks(ids) {
    var order = Array.isArray(ids) ? ids : [];
    var pos = 1;
    order.forEach(function (id) {
      var t = (db.barrier_tasks || []).find(function (x) { return x.id === id && !x.archived_at; });
      if (t) t.sort = pos++;
    });
    save();
  }

  function deleteBarrierTask(id) {
    var t = (db.barrier_tasks || []).find(function (x) { return x.id === id && !x.archived_at; });
    if (!t) throw new Error('غير موجود');
    t.archived_at = nowStamp();
    save();
  }

  function getBarrierHosts() {
    return (db.barrier_hosts || []).filter(function (t) { return !t.archived_at; })
      .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || a.id - b.id; });
  }

  function addBarrierHost(b) {
    var title = String(b.title || '').trim();
    if (!title) throw new Error('العنوان مطلوب');
    var maxSort = (db.barrier_hosts || []).reduce(function (m, t) { return Math.max(m, t.sort || 0); }, 0);
    var t = {
      id: nextId(db.barrier_hosts), title: title,
      active: 1, sort: maxSort + 1, archived_at: null, created_at: nowStamp()
    };
    if (!db.barrier_hosts) db.barrier_hosts = [];
    db.barrier_hosts.push(t);
    save();
    return t;
  }

  function reorderBarrierHosts(ids) {
    var order = Array.isArray(ids) ? ids : [];
    var pos = 1;
    order.forEach(function (id) {
      var t = (db.barrier_hosts || []).find(function (x) { return x.id === id && !x.archived_at; });
      if (t) t.sort = pos++;
    });
    save();
  }

  function deleteBarrierHost(id) {
    var t = (db.barrier_hosts || []).find(function (x) { return x.id === id && !x.archived_at; });
    if (!t) throw new Error('غير موجود');
    t.archived_at = nowStamp();
    save();
  }

  function isBarrierDone(dateStr) {
    try { return localStorage.getItem('noor_barrier_done_' + (dateStr || todayStr())) === '1'; } catch (e) { return false; }
  }

  function setBarrierDone(dateStr, done) {
    try { localStorage.setItem('noor_barrier_done_' + (dateStr || todayStr()), done ? '1' : '0'); } catch (e) {}
  }

  function ensureBarrierForDate(dateStr, dailyTasks) {
    var tasks = getBarrierTasks();
    var active = tasks.filter(function (t) { return t.active; });
    if (!active.length) return null;
    var hosts = getBarrierHosts().filter(function (t) { return t.active; });
    var done = isBarrierDone(dateStr);
    var host = null;
    if (hosts.length) {
      var scored = hosts.map(function (h) {
        var score = 0;
        var keywords = ['تمارين', 'تمرين', 'حفظ', 'تعلم', 'قراء', 'تحدث', 'مذاكر', 'دراس', 'مراجع', 'مطالع', 'تعليم'];
        keywords.forEach(function (k) { if ((h.title || '').indexOf(k) !== -1) score++; });
        return { h: h, score: score };
      }).sort(function (a, b) { return b.score - a.score || a.h.id - b.h.id; });
      host = scored[0].h;
    } else if (dailyTasks && dailyTasks.length) {
      host = dailyTasks[0];
    }
    return {
      date: dateStr, title: active[0].title, category: active[0].category || '',
      done: done, host_title: host ? host.title : null, host_id: host ? host.id : null
    };
  }

  /* ===== التحديات الشخصية — مستقلة تمامًا عن كسر الحواجز ===== */
  /* تحدي = مهمة تُحوَّل إلى التزام بمدة أيام محددة، يُعلَّم كل يوم منجزًا حتى الاكتمال */
  function cleanChallenge(c) {
    var dates = Array.isArray(c.done_dates) ? c.done_dates.map(function (s) { return String(s); }).filter(Boolean) : [];
    return {
      id: num(c.id, 0), task_id: c.task_id ? num(c.task_id, null) : null,
      title: String(c.title || ''),
      total: Math.max(1, Math.round(num(c.total, 1))),
      start: String(c.start || todayStr()),
      done_dates: dates,
      archived_at: c.archived_at || null,
      created_at: c.created_at || null
    };
  }

  function getChallenges() {
    return (db.challenges || []).filter(function (c) { return !c.archived_at; })
      .map(cleanChallenge)
      .sort(function (a, b) { return a.id - b.id; });
  }

  function addChallenge(b) {
    var title = String(b.title || '').trim();
    if (!title) throw new Error('عنوان التحدي مطلوب');
    var t = {
      id: nextId(db.challenges || []),
      task_id: b.task_id ? Number(b.task_id) : null,
      title: title,
      total: Math.max(1, Math.min(365, Math.round(num(b.total, 1)))),
      start: String(b.start || todayStr()),
      done_dates: [],
      archived_at: null,
      created_at: nowStamp()
    };
    if (!db.challenges) db.challenges = [];
    db.challenges.push(t);
    save();
    return cleanChallenge(t);
  }

  function toggleChallengeDay(id, dateStr) {
    var c = db.challenges.find(function (x) { return x.id === Number(id) && !x.archived_at; });
    if (!c) throw new Error('التحدي غير موجود');
    var d = String(dateStr || todayStr());
    var i = c.done_dates.indexOf(d);
    if (i >= 0) c.done_dates.splice(i, 1); else c.done_dates.push(d);
    save();
    return cleanChallenge(c);
  }

  function archiveChallenge(id) {
    var c = db.challenges.find(function (x) { return x.id === Number(id) && !x.archived_at; });
    if (!c) throw new Error('التحدي غير موجود');
    c.archived_at = nowStamp();
    save();
  }

  /* ===== ثوابت النظام — ربط كل عنسل بسلسلته الكاملة ===== */
  function getValueForGoal(goalId) {
    var g = db.goals.find(function (x) { return x.id === Number(goalId); });
    if (!g || !g.value_id) return null;
    var v = db.values.find(function (x) { return x.id === g.value_id; });
    return v ? cleanValue(v) : null;
  }

  function getGoalForProject(projectId) {
    var p = db.projects.find(function (x) { return x.id === Number(projectId); });
    if (!p || !p.goal_id) return null;
    var g = db.goals.find(function (x) { return x.id === p.goal_id; });
    return g ? cleanGoal(g) : null;
  }

  function getValueForProject(projectId) {
    var g = getGoalForProject(projectId);
    if (!g || !g.value_id) return null;
    var v = db.values.find(function (x) { return x.id === g.value_id; });
    return v ? cleanValue(v) : null;
  }

  function getGoalForTask(taskId) {
    var t = db.tasks.find(function (x) { return x.id === Number(taskId); });
    if (!t) return null;
    if (t.goal_id) {
      var g = db.goals.find(function (x) { return x.id === t.goal_id; });
      return g ? cleanGoal(g) : null;
    }
    if (t.project_id) return getGoalForProject(t.project_id);
    return null;
  }

  function getFullChainForProject(projectId) {
    var p = db.projects.find(function (x) { return x.id === Number(projectId); });
    if (!p) return null;
    var goal = null, value = null;
    if (p.goal_id) {
      var g = db.goals.find(function (x) { return x.id === p.goal_id; });
      if (g) { goal = cleanGoal(g); if (g.value_id) { var v = db.values.find(function (x) { return x.id === g.value_id; }); if (v) value = cleanValue(v); } }
    }
    return { project: cleanProject(p), goal: goal, value: value };
  }

  function getFullChainForTask(taskId) {
    var t = db.tasks.find(function (x) { return x.id === Number(taskId); });
    if (!t) return null;
    var project = null, goal = null, value = null;
    if (t.project_id) {
      var p = db.projects.find(function (x) { return x.id === t.project_id; });
      if (p) { project = { id: p.id, name: p.name, type: p.type }; if (p.goal_id) { var g = db.goals.find(function (x) { return x.id === p.goal_id; }); if (g) { goal = { id: g.id, title: g.title, color: g.color }; if (g.value_id) { var v = db.values.find(function (x) { return x.id === g.value_id; }); if (v) value = { id: v.id, title: v.title, icon: v.icon }; } } } }
    }
    if (!goal && t.goal_id) {
      var g2 = db.goals.find(function (x) { return x.id === t.goal_id; });
      if (g2) { goal = { id: g2.id, title: g2.title, color: g2.color }; if (g2.value_id) { var v2 = db.values.find(function (x) { return x.id === g2.value_id; }); if (v2) value = { id: v2.id, title: v2.title, icon: v2.icon }; } }
    }
    return { task: cleanTask(t), project: project, goal: goal, value: value };
  }

  function getChainBreadcrumb(projectId) {
    var chain = getFullChainForProject(projectId);
    if (!chain || !chain.project) return '';
    var parts = [];
    if (chain.value) parts.push(chain.value.icon + ' ' + chain.value.title);
    if (chain.goal) parts.push(chain.goal.title);
    parts.push(chain.project.name);
    return parts.join(' ← ');
  }

  function getProjectProgress(projectId) {
    var pts = db.project_tasks.filter(function (t) { return t.project_id === Number(projectId) && !t.archived_at; });
    if (!pts.length) return { done: 0, total: 0, pct: 0 };
    var done = pts.filter(function (t) { return !!t.completed_at; }).length;
    return { done: done, total: pts.length, pct: Math.round((done / pts.length) * 100) };
  }

  function getGoalProgress(goalId) {
    var projs = db.projects.filter(function (p) { return p.goal_id === Number(goalId) && !p.archived_at; });
    var habits = db.habits.filter(function (h) { return h.goal_id === Number(goalId) && !h.archived_at; });
    var pts = db.project_tasks.filter(function (t) {
      var p = projs.find(function (pp) { return pp.id === t.project_id; });
      return p && !t.archived_at;
    });
    var done = pts.filter(function (t) { return !!t.completed_at; }).length;
    var total = pts.length;
    return { done: done, total: total, pct: total ? Math.round((done / total) * 100) : 0, projects: projs.length, habits: habits.length };
  }

  /* ===== يوم كسر الحدود: كل 3 أيام من بداية الخطة ===== */
  function isLimitBreakDay(dateStr) {
    var s = db.settings;
    if (!s.life_start) return false;
    var every = 3;
    var d0 = new Date(String(s.life_start).slice(0, 10) + 'T00:00:00Z');
    var d1 = new Date(dateStr + 'T00:00:00Z');
    if (isNaN(d0) || isNaN(d1)) return false;
    var diff = Math.round((d1 - d0) / 86400000);
    return diff > 0 && diff % every === 0;
  }

  function getLimitBreakChallenges(dateStr) {
    var ds = dateStr || todayStr();
    return (db.challenges || []).filter(function (c) {
      if (c.archived_at) return false;
      var start = String(c.start || '');
      return start <= ds && !c.done_dates.some(function (d) { return d === ds; }) === false;
    });
  }

  load();

  global.NoorStore = {
    daily: daily,
    addTask: addTask, updateTask: updateTask, toggleTask: toggleTask,
    reorderTasks: reorderTasks, archiveTask: archiveTask, restoreTask: restoreTask,
    getProjects: getProjects, addProject: addProject, updateProject: updateProject,
    archiveProject: archiveProject, archiveAllProjects: archiveAllProjects, completeProject: completeProject,
    getProjectById: getProjectById, getProjectTasksAll: getProjectTasksAll,
    addProjectTask: addProjectTask, updateProjectTask: updateProjectTask, archiveProjectTask: archiveProjectTask, toggleProjectTask: toggleProjectTask,
    getSessions: getSessions, addSession: addSession,
    getDesires: getDesires, addDesire: addDesire, updateDesire: updateDesire, archiveDesire: archiveDesire,
    getSettings: getSettings, updateSettings: updateSettings,
    stats: stats, dump: dump, restore: restore, reset: reset, archiveAll: archiveAll,
    restoreProject: restoreProject, restoreProjectTask: restoreProjectTask, restoreGoal: restoreGoal, restoreValue: restoreValue,
    restoreSubgoal: restoreSubgoal, restoreHabit: restoreHabit, restoreNote: restoreNote,
    restorePost: restorePost, restoreDesire: restoreDesire, restoreSimpleHabit: restoreSimpleHabit,
    todayStr: todayStr,
    hasLifePlan: hasLifePlan, setLifeStart: setLifeStart,
    yearWeeks: yearWeeks, yearIndex: yearIndex, weekInYear: weekInYear, monthIndex: monthIndex,
    weekStartDate: weekStartDate, weekEndDate: weekEndDate, lifeStart: lifeStart,
    freezeInfo: freezeInfo, inFreeze: inFreeze, freezeRemaining: freezeRemaining, planStart: planStart,
    isEmpty: isEmpty,
    getGoals: getGoals, addGoal: addGoal, updateGoal: updateGoal, archiveGoal: archiveGoal,
    activeGoalsForYear: activeGoalsForYear, goalYears: goalYears, goalFirstYear: goalFirstYear,
    goalDurationYears: goalDurationYears, goalIsCompleted: goalIsCompleted, weeksForGoal: weeksForGoal,
    toggleGoalComplete: toggleGoalComplete, setGoalComplete: setGoalComplete,
    getValues: getValues, getGoalsByValue: getGoalsByValue, addValue: addValue, updateValue: updateValue, archiveValue: archiveValue,
    getSubgoals: getSubgoals, addSubgoal: addSubgoal, updateSubgoal: updateSubgoal, archiveSubgoal: archiveSubgoal, branchSchedule: branchSchedule,
    getHabits: getHabits, addHabit: addHabit, updateHabit: updateHabit, archiveHabit: archiveHabit,
    getSimpleHabits: getSimpleHabits, addSimpleHabit: addSimpleHabit, updateSimpleHabit: updateSimpleHabit, archiveSimpleHabit: archiveSimpleHabit,
    getTodaySimpleHabits: getTodaySimpleHabits, toggleSimpleHabitDone: toggleSimpleHabitDone, isSimpleHabitDone: isSimpleHabitDone,
    getBarrierTasks: getBarrierTasks, addBarrierTask: addBarrierTask, reorderBarrierTasks: reorderBarrierTasks, deleteBarrierTask: deleteBarrierTask,
    getBarrierHosts: getBarrierHosts, addBarrierHost: addBarrierHost, reorderBarrierHosts: reorderBarrierHosts, deleteBarrierHost: deleteBarrierHost,
    isBarrierDone: isBarrierDone, setBarrierDone: setBarrierDone, ensureBarrierForDate: ensureBarrierForDate,
    getChallenges: getChallenges, addChallenge: addChallenge, toggleChallengeDay: toggleChallengeDay, archiveChallenge: archiveChallenge,
    getNotes: getNotes, addNote: addNote, archiveNote: archiveNote,
    getPosts: getPosts, getPost: getPost, getPostAny: getPostAny, getAllPosts: getAllPosts, addPost: addPost, updatePost: updatePost, archivePost: archivePost,
    yearStats: yearStats,
    getArchive: getArchive, collectItemsForRange: collectItemsForRange,
    historyRange: historyRange, getDayHistory: getDayHistory,
    getJournalQuestions: getJournalQuestions, saveJournalQuestions: saveJournalQuestions,
    getTodayJournal: getTodayJournal, saveJournalAnswer: saveJournalAnswer,
    completeJournal: completeJournal, getJournalHistory: getJournalHistory,
    getValueForGoal: getValueForGoal, getGoalForProject: getGoalForProject,
    getValueForProject: getValueForProject, getGoalForTask: getGoalForTask,
    getFullChainForProject: getFullChainForProject, getFullChainForTask: getFullChainForTask,
    getChainBreadcrumb: getChainBreadcrumb, getProjectProgress: getProjectProgress,
    getGoalProgress: getGoalProgress, isLimitBreakDay: isLimitBreakDay,
    factoryReset: factoryReset
  };
})(typeof window !== 'undefined' ? window : globalThis);
