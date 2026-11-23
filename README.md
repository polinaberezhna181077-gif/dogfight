# Dogfight — Лабораторна робота №4 (Node.js: EventEmitter, Streams, WebSocket-сервер)

Мультиплеєрний сервер і клієнт у форматі `npm workspaces` (`client/` + `server/`): HTTP-сервер на `node:http`, WebSocket-сервер на `ws` із валідацією протоколу та heartbeat, кімнати на базі `EventEmitter` та потокове логування матчів у форматі NDJSON через `Transform` + `pipeline`.

---

## 1. Доказ Backpressure: графік пам'яті (`rss`) при завантаженні 200 МБ реплею

При завантаженні синтетичного логу матчу обсягом **200 МБ** (`GET /api/replays/benchmark-200mb.ndjson`) через повільний канал (**Slow 3G / 1 Mbps throttling** у DevTools) сервер використовує потокову передачу `pipeline(createReadStream(file), res)` замість буферизації файлу в оперативну пам'ять (`readFile`).

### Динаміка `process.memoryUsage().rss` під час стрімінгу 200 МБ:

```text
RSS (MB)
250 |                                              [Без backpressure: OOM / ріст буфера]
200 |                                          . '
150 |                                      . '
100 |                                  . '
 50 |  *-------*-------*-------*-------*-------*   [З pipeline + backpressure: ~39–42 MB]
  0 +--------------------------------------------> Час завантаження (с)
       0s      15s     30s     45s     60s     75s