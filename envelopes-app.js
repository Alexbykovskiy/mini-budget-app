// envelopes.js
window.addEventListener("DOMContentLoaded", () => {
  // Пока только заглушка, потом сюда можно добавить CRUD для конвертов
  const root = document.getElementById('envelope-app');
  root.innerHTML = `
    <fieldset class="block">
      <h2>Метод конвертов</h2>
      <div class="row" style="margin-top: 16px;">
        <div style="flex:1">
          <div style="font-size:18px; font-weight:700;">Пример: \"Отпуск\"</div>
          <div style="font-size:15px; color:#666;">€200 / €1000</div>
        </div>
        <button class="round-btn green" title="Добавить">
          <span data-lucide="plus"></span>
        </button>
      </div>
      <p style="margin-top:18px; color:#aaa; font-size:13px;">Добавь свои конверты для накоплений!</p>
    </fieldset>
  `;
  lucide.createIcons();
});
