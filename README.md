# Dogfight Multiplayer — Lab 06 (TypeScript)

Повноцінна міграція трьох пакетів (`shared/`, `server/`, `client/`) на суворий TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`) зі збереженням детермінізму симуляції та рантайм-валідацією через Zod на всіх межах процесів.

## Запуск і перевірка

```bash
npm install
npm run typecheck    # збірка shared + перевірка типів server та client
npm run test:shared  # тест детермінізму симуляції та бінарного кодека
npm run build        # збірка shared та клієнтського бандлу Vite
npm start            # запуск сервера ([http://127.0.0.1:3000](http://127.0.0.1:3000))