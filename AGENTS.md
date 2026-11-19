# Im Minutenclub-Repository arbeiten

Die App verwaltet gemeinsame Paketminuten einer Zürcher Scooter-Gruppe. Die Konten für die App sind persönlich. Die Weboberfläche ist deutschsprachig, mit Schweizer Schreibweise, CHF und Zürcher Anzeigezeit. Der Demo-Modus bildet die Buchungsabläufe ohne Cloud-Zugang ab. [Benutzerhandbuch](docs/benutzerhandbuch.md) · [Betrieb](docs/setup.md)

## Einstieg im Checkout

Arbeite im Repository-Stamm. Mit Node.js 24 und `npm ci` erhältst du die Versionen aus dem Lockfile. Starte mit `npm run dev` und öffne `http://localhost:3000/?demo=1`. Für die Demo und die automatisierten Tests sind weder Vercel noch ein Supabase-Projekt erforderlich. Die Demo verwendet den Browser-Speicherschlüssel `minutenclub-demo-v1`. Ältere gespeicherte Beispieldaten können Felder späterer Migrationen vermissen.

## Wo eine Änderung beginnt

| Aufgabe                                                | Einstiegspunkt                                                                                                                     | Zweite Stelle zum Abgleichen                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Anzeige, Formular, Navigation, Rollenabhängigkeit      | [Dashboard und EntryDialog](components/dashboard.tsx)                                                                              | [Responsive Gestaltung](app/globals.css) und Browserabläufe                     |
| Neuer Schreibvorgang oder geändertes Formular          | [Aktionen, Einheiten und Typen](lib/domain.ts)                                                                                     | [Demo-Buchungen](lib/demo.ts), SQL-Funktion und Aufruf aus der UI               |
| Login, Wiederholung, Realtime, veralteter Gruppenstand | [ClubApp](components/club-app.tsx)                                                                                                 | [Supabase-Client und Snapshot](lib/supabase.ts)                                 |
| Schema, Rechte oder Berechnung                         | [Migrationen](supabase/migrations/)                                                                                                | [PostgreSQL-Integrationstests](tests/database.test.ts)                          |
| Konten, Einladungen, Passwörter                        | [Browser-Client](lib/accounts.ts) und [Passwort-Dashboard](components/password-dashboard.tsx)                                      | [Konto-Funktionen](supabase/functions/) und Berechtigungen im Testprojekt       |
| Optionale Fahrtorte, Statistik und Feedback            | [Ortslogik](lib/location.ts), [Ortsstatistik](components/location-stats.tsx) und [Feedback-Dialog](components/feedback-dialog.tsx) | Standort nur auf Anforderung, Feedback-Schalter in [.env.example](.env.example) |
| Spätere Erkennung aus Bildern                          | [Recognizer-Vertrag](lib/recognition.ts)                                                                                           | [OCR-Planung und Datenminimierung](docs/screenshot-recognition.md)              |

## Eine Buchung vom Formular bis zur Anzeige verfolgen

1. `EntryDialog` validiert die Eingabe und ruft `onSave` auf. Beispiel Paketkauf: `splitPackage` liefert Minuten und Rappen pro Mitglied für die Vorschau. Die RPC erhält die Eingaben, aus denen sie die Anteile selbst berechnet.
2. `ClubApp.mutate` ergänzt Gruppen-ID und Anforderungs-ID. In der Demo schreibt `demoAction` einen neuen Snapshot. Im gemeinsamen Betrieb ruft der Browser die RPC mit der angemeldeten Supabase-Sitzung auf.
3. Die Buchungsfunktion prüft Rolle und aktive Gruppenzugehörigkeit, sperrt die Gruppe und erkennt Wiederholungen über `app_private.claim`. Beim Paketkauf entstehen Paket, Kostenanteile und positive Journalbeträge in einer Transaktion. Eine fehlerhafte Eingabe darf keine Teilbuchung hinterlassen.
4. `get_dashboard` liefert einen gemeinsamen Stand. `summary` leitet Salden, Kontingente und Verbrauch daraus ab. Realtime meldet Änderungen, woraufhin der Client erneut lädt. Auch Fokuswechsel und der 30-Sekunden-Abgleich im sichtbaren Fenster lösen einen Abruf aus. Die Sequenznummer in `ClubApp` schützt gegen überholte Antworten. [Architektur](docs/architecture.md)

## Verträge für kompatible Änderungen

- **Einheiten.** Die UI erfasst ganze Minuten und CHF mit bis zu zwei Nachkommastellen. PostgreSQL speichert Sekunden und Rappen. `minutes()` formatiert Sekunden als Minuten. `splitPackage()` erwartet bereits Paketminuten und Rappen.
- **Aufteilung.** `record_topup.p_contributions` akzeptiert weiterhin die bisherige JSON-Liste mit `member_id` und `amount_rappen`. Gleichteilung und Minutenbedarf verwenden ein Objekt mit `mode` und `shares`. Jede Zeile enthält `member_id` und `weight`. Bei `equal` beträgt jedes Gewicht eins, bei `minutes` entspricht es dem gewünschten Minutenanteil. Preis und Zeit werden unabhängig auf ganze Einheiten verteilt. TypeScript verwendet BigInt, SQL exakte NUMERIC-Quotienten und Reste. [Datenmodell](docs/data-model.md)
- **IDs und Wiederholungen.** Mitglieds-ID und Auth-Benutzer-ID haben unterschiedliche Aufgaben. Fahrten werden der Mitgliedschaft der eingeloggten Person zugeordnet. Derselbe Buchungsvorgang behält seine UUID bei einem erneuten Speicheraufruf. Eine neue UUID bezeichnet einen neuen Vorgang. Namensänderungen und Stornos dürfen historische Zuordnungen nicht aufbrechen.
- **Historische Daten.** Eine neue SQL-Datei erweitert die bisherige Migrationsfolge. Die Funktionen der älteren Migrationen zeigen den damaligen Stand. Prüfe auch spätere `create or replace function`-Definitionen. Ältere Pakete können ohne Beitragszeilen existieren, ältere Stornos ohne dokumentierten Akteur.
- **UI.** Das persönliche Restguthaben steht auf der Übersicht zuerst. Negative und grosse Salden müssen lesbar bleiben. Teste Formulare bei schmaler Breite sowie Schliessen per Escape mit anschliessender Fokusrückgabe. Animationen berücksichtigen `prefers-reduced-motion`.
- **Zugangsdaten.** Der Browser verwendet Projekt-URL und Publishable Key bzw. Legacy-Anon-Key. Produktive Autorisierung erfolgt in PostgreSQL. Private Fahrtbilder und Datenexporte gehören unter `private/`, lokale Zugangsdaten in `.env.local`. Verwende synthetische Beispiele in Tests und Dokumentation.

## Änderungen prüfen

```sh
npm ci
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run typecheck
npm run format:check
```

Die Fachtests prüfen Rechenregeln. Die Datenbanktests führen die SQL-Dateien in PGlite aus und simulieren Supabase-Rollen und Benutzerkennungen. Sie eignen sich für Transaktionen, RLS, Wiederholungen und Altdaten. Playwright startet einen eigenen Entwicklungsserver auf Port 3100 und bedient die Demo im Browser. Beende einen parallel laufenden Entwicklungsserver im selben Checkout vor diesem Test. Unter Linux installiert `npx playwright install --with-deps chromium` bei Bedarf die Systembibliotheken. Ein bereits vorhandenes Chromium lässt sich über `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` auswählen.

Ein erfolgreicher CI-Lauf prüft den lokalen Anwendungsstack. Benutzerregistrierung, Passwortverwaltung und Ereignisse zwischen echten Geräten brauchen ein eingerichtetes Testprojekt mit zwei getrennten Zugängen. Für Schemaänderungen zuerst die ausstehenden Migrationen dort anwenden, dann das zugehörige Frontend testen. [CI-Schritte](.github/workflows/ci.yml) · [Abnahmelauf und Deployment](docs/setup.md)

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
