# Dogfight — Лабораторні роботи №2–3

Аркадна космічна гра на JavaScript: об'єктна модель сутностей, менеджер світу на базі `Map`, асинхронний пайплайн завантаження ассетів, лобі перед грою та звук через Web Audio API.

---

## Лабораторна робота №3: Асинхронний JavaScript, Loading Screen, Lobby та Web Audio

### 1. Порівняння завантаження ассетів: Sequential `await` vs Concurrent `Promise.all`

Завантаження 5 файлів із `manifest.json` (`sprites.png`, `shoot.wav`, `hit.wav`, `explosion.wav`, `arena.json`) при штучній затримці мережі (~150 мс на кожен запит):

| Режим завантаження | Реалізація | Загальний час | Поведінка прогрес-бару |
| :--- | :--- | :---: | :--- |
| **Sequential (`for..of` + `await`)** | Кожен файл чекає завершення попереднього (`await loadImg(); await loadAudio()...`) | **~785 мс** | Крок за кроком: 20% → 40% → 60% → 80% → 100% |
| **Concurrent (`Promise.all`)** | Усі 5 запитів стартують одночасно, загальний час = найдовший запит | **~172 мс** | Оновлюється по мірі завершення кожного промісу (у 4.5 раза швидше) |

---

### 2. П'ять головоломок порядку виконання (Microtasks vs Tasks vs rAF)

#### Головоломка 1: Базовий `async/await` та синхронний код
```js
async function load() {
  console.log('A');
  await Promise.resolve();
  console.log('B');
}
console.log('C');
load();
console.log('D');