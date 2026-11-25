# time_management_system

מערכת לניהול זמן משפחתי בהתקנה עצמית (Umbrel / Portainer): שגרות ומשימות קבועות בשעות, תצוגת יום/שבוע/חודש, חשבונות משתמשים, שיתוף והצלבה בין לוחות.

- תוכנית המערכת: [docs/PLAN.md](docs/PLAN.md)
- מוקאפ דינמי: https://claude.ai/artifact/GpY2yLWCvLwprHBdYAn29o

## מצב הפרויקט

שלב 0 מתוך התוכנית: שלד שרץ כקונטיינר אחד ומציג עמוד מצב. ההתחברות והלוח עצמו עדיין לא קיימים.

## מבנה

```
server/   שרת ה-API (Node 22, Fastify, SQLite דרך Drizzle)
web/      הלקוח (React, Vite), נבנה לקבצים סטטיים שהשרת מגיש
deploy/   קובצי פריסה (Portainer)
docs/     תוכנית המערכת
```

## פיתוח מקומי

נדרש Node 22 ומעלה.

```bash
npm ci
```

```bash
npm run dev
```

הלקוח עולה על http://localhost:5173 ומפנה קריאות `/api` לשרת שעל פורט 3000. הנתונים נשמרים בתיקיית `data/` בשורש הריפו.

בדיקות, בדיקת טיפוסים ובנייה:

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run build
```

אחרי שינוי ב-`server/src/db/schema.ts` יוצרים קובץ מיגרציה:

```bash
npm run db:generate --workspace @tms/server
```

## הרצה ב-Docker

```bash
docker build -t seder-yom .
```

```bash
docker run --rm -p 8420:3000 -e TZ=Asia/Jerusalem -v seder-data:/data seder-yom
```

העמוד זמין ב-http://localhost:8420, ובדיקת הבריאות ב-`/api/health`.

משתני סביבה:

| משתנה | ברירת מחדל | משמעות |
|---|---|---|
| `PORT` | `3000` | הפורט שהשרת מאזין עליו בתוך הקונטיינר |
| `DATA_DIR` | `/data` | תיקיית הנתונים (קובץ ה-SQLite) |
| `TZ` | UTC | אזור הזמן של הלוח, למשל `Asia/Jerusalem` |

## פריסה ב-Portainer (Umbrel)

1. ה-CI מפרסם אימג' ל-`ghcr.io/tcbr10/time_management_system` בכל דחיפה ל-`main` ובכל תגית `v*`, עבור amd64 ו-arm64.
2. ב-Portainer: Stacks ← Add stack, מדביקים את [deploy/portainer/docker-compose.yml](deploy/portainer/docker-compose.yml) ולוחצים Deploy.
3. פותחים `http://<כתובת-ה-Umbrel>:8420`.

אם המשיכה של האימג' נכשלת בהרשאה: חבילה חדשה ב-GHCR נוצרת כפרטית. אפשר להפוך אותה לציבורית בהגדרות החבילה ב-GitHub, או להוסיף ב-Portainer את `ghcr.io` כ-Registry עם Personal Access Token בעל הרשאת `read:packages`.
