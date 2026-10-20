/* نُور — مشغّل التطبيق. لا توجد بوابة كلمة مرور في هذه النسخة. */
(function () {
  'use strict';

  var STORE_SRC = 'js/store.js?v=21';
  var APP_SRC = 'js/app.js?v=98';
  var SEED_URL = 'data/seed.json';

  document.body.classList.add('noor-unlocked');

  function hasStoredData() {
    try {
      return !!(window.localStorage && window.localStorage.getItem('noor_db_v1'));
    } catch (err) {
      return true; // لا نستبدل بيانات قد يتعذر الوصول إليها.
    }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('تعذّر تحميل الملف: ' + src)); };
      document.body.appendChild(script);
    });
  }

  async function seedIfEmpty() {
    if (hasStoredData()) return;
    var response = await fetch(SEED_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('تعذّر تحميل البيانات الأولية (' + response.status + ')');
    var snapshot = await response.json();
    if (!window.NoorStore || typeof window.NoorStore.restore !== 'function') {
      throw new Error('طبقة البيانات غير جاهزة');
    }
    window.NoorStore.restore(snapshot);
  }

  function showLoadError(message) {
    var content = document.getElementById('content');
    if (!content) return;
    var box = document.createElement('div');
    box.className = 'empty-box';
    var title = document.createElement('strong');
    title.textContent = 'تعذّر تشغيل نُور';
    var detail = document.createElement('p');
    detail.textContent = message;
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn';
    retry.textContent = 'إعادة المحاولة';
    retry.addEventListener('click', function () { window.location.reload(); });
    box.appendChild(title);
    box.appendChild(detail);
    box.appendChild(retry);
    content.replaceChildren(box);
  }

  async function boot() {
    try {
      await loadScript(STORE_SRC);
    } catch (err) {
      showLoadError('لم يتم تحميل مخزن البيانات. حدّث الصفحة وحاول مرة أخرى.');
      console.error('[noor] store loading failed:', err);
      return;
    }

    try {
      await seedIfEmpty();
    } catch (err) {
      // تُفتح الواجهة حتى عند تعذر تحميل النسخة الأولية، دون الكتابة فوق بيانات موجودة.
      console.warn('[noor] initial data was not loaded:', err);
    }

    try {
      await loadScript(APP_SRC);
    } catch (err) {
      showLoadError('لم يتم تحميل واجهة النظام. تحقق من الاتصال ثم أعد المحاولة.');
      console.error('[noor] app loading failed:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
