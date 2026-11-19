# Minutenclub · Dott Minuten

Eine iPhone-taugliche Web-App für eure gemeinsamen Scooter-Minutenpakete. Jede Person hat einen eigenen Login, trägt ihre Fahr- und Pausenminuten ein und sieht ihr Guthaben sowie die Statistik der Crew.

**Stand:** Die erste App-Version ist implementiert und für Vercel + Supabase vorbereitet. Eine produktive Installation erfordert noch eure Konten und die Einrichtung gemäss [Anleitung](docs/setup.md). Die App ist ein unabhängiges Projekt ohne offizielle Verbindung zu Dott.

## Wegweiser

| Ich möchte …                                                                  | Passende Anleitung                                          |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Die App auf dem iPhone nutzen, Fahrten erfassen und Pakete aufteilen          | [Benutzerhandbuch mit Beispielen](docs/benutzerhandbuch.md) |
| Den gemeinsamen Betrieb auf Supabase und Vercel einrichten oder aktualisieren | [Einrichtung und Abnahme](docs/setup.md)                    |
| Als Coding-Agent oder Entwickler eine Änderung umsetzen und testen            | [Einstieg, Codepfade und technische Verträge](AGENTS.md)    |

## Was funktioniert?

- **Direkte Anmeldung per Benutzername & Passwort** (ohne E-Mail-Zwang oder MFA) plus eigenes **Passwort- & Zurücksetzungs-Dashboard** für Gruppen-Admins (offene «Passwort vergessen»-Anfragen bearbeiten, Passwörter neu vergeben oder Mitglieder direkt mit Startpasswort anlegen).
- Gruppe erstellen, Freunde mit zeitlich begrenztem Einladungscode hinzufügen.
- Beliebig erweiterbare Mitgliederliste mit Admin- und Mitgliedsrollen. Eigene Namen lassen sich ändern; Admins können alle Mitgliedsnamen ändern.
- Eigene Fahrten manuell erfassen oder live per **Dott entsperren** starten: **Verbrauch = Fahrzeit + Pausierzeit**.
- **Optionale Standortfreigabe nur bei aktiver Verwendung:** Beim Entsperren oder Speichern lässt sich der aktuelle Standort einmalig per Knopfdruck übernehmen (kein `watchPosition`, kein Hintergrund-Tracking, lokale Zuordnung auf dem Gerät).
- **Uhrzeit- und Zielstatistik:** Auswertung über 24 Stunden, Tageszeiten, beliebteste Ziele und Routenprofile (_wer wie oft um welche Uhrzeit wohin gefahren ist_).
- **Interaktives Onboarding & Einladungslinks:** 3-stufige Einführungstour mit Pass-Simulator sowie teilbare Einladungslinks (`?invite=...`), die nach der Anmeldung automatisch übernommen werden.
- **Dark & Light Mode:** Folgt automatisch der Systemeinstellung (für gute Lesbarkeit draussen in der Sonne sowie abends) oder lässt sich direkt zwischen _System_, _Hell_ und _Dunkel_ umschalten.
- **Vorbereitetes Feedback-Fenster:** Direkt in der App testbar und beim Launch auf Vercel & Supabase über `NEXT_PUBLIC_FEEDBACK_ENABLED=true` sofort live in `public.feedback` aktivierbar.
- Frei wählbare positive Minutengutschriften durch Admins, keine festen Aufladepakete.
- Persönliche Salden, gemeinsamer Paketbestand und nachvollziehbares Buchungsjournal.
- Guthaben gemeinsam aufladen: Teilnehmende auswählen und Preis und Minuten gleich teilen, Wunschminuten vorgeben oder bezahlte CHF-Beiträge eintragen. Vor dem Speichern sind beide Anteile pro Person sichtbar.
- Verbrauchsstatistik nach Person und Zeitraum, Fahr- und Pausierzeit getrennt. Auf der Startseite: eigenes Restguthaben, eigener Verbrauch, Gruppenrest und Restguthaben aller Mitglieder.
- Balkendiagramm pro Person: transparentes Gesamtkontingent im Hintergrund, bisheriger Verbrauch davor.
- Fahrten durch Admins stornieren: Gegenbuchung statt Löschen. Eigener Storno-Verlauf mit Grund, Zeitpunkt, ausführender Person und zurückgegebenen Minuten.
- Supabase Realtime plus erneutes Laden nach App-Rückkehr, Verbindungsaufbau und alle 30 Sekunden.
- Home-Bildschirm-Installation mit App-Manifest und iPhone-Icon.
- Expliziter Demo-Modus mit Oskar, August und Max. Die Beispieldaten bleiben auf dem jeweiligen Gerät.

**Abrechnung:** 14 Minuten Fahrt + 1 Minute Pause ergeben 15 Minuten Verbrauch. Freischaltgebühren werden ignoriert. Die CHF-Verbrauchswerte sind ausdrücklich Schätzungen aus dem gewichteten Preis der bis zum Fahrtzeitpunkt erfassten Paketkäufe; sie sind keine bestätigte Dott-Paketzuordnung und keine verbindlichen Schulden. Historische Schätzungen werden bei späteren Käufen nicht rückwirkend verändert. Unbekannte Kosten bleiben offen.

Beispiel einer Aufladung: 600 Minuten kosten CHF 90.00. Oskar zahlt CHF 30.00, August CHF 45.00 und Max CHF 15.00. Die App schreibt automatisch **200, 300 und 100 Minuten** gut. Die Beiträge müssen zusammen dem Paketpreis entsprechen. Rundungsreste werden nach grösstem Nachkommaanteil verteilt; die Summe der gutgeschriebenen ganzen Minuten entspricht immer dem Paket.

## Lokal starten

Voraussetzung: Node.js 22 oder neuer, empfohlen Node.js 24 LTS.

```sh
npm ci
npm run dev
```

Ohne Supabase-Konfiguration zeigt die Startseite einen Einrichtungslink und den Button **Demo ausprobieren**. Die Demo lässt sich auch unter `http://localhost:3000/?demo=1` öffnen. Es gibt keine stillschweigende Umschaltung von echten Daten auf Beispieldaten.

Für den gemeinsamen Betrieb die SQL-Migrationen in Supabase der Reihe nach ausführen und die zwei öffentlichen Projektwerte in `.env.local` beziehungsweise Vercel hinterlegen. Vollständige Schritte einschliesslich Konto-Funktionen: **[Supabase und Vercel einrichten](docs/setup.md)**.

## Prüfen

```sh
npm run test
npm run lint
npm run typecheck
npm run build

# Optional: Browser installieren und Desktop-/Mobilabläufe prüfen
npx playwright install chromium
npm run test:e2e
```

Für die Browserprüfungen einen eventuell laufenden `npm run dev`-Prozess zuerst beenden.

Die Datenbanktests führen dieselben SQL-Migrationen in PostgreSQL via PGlite aus. Sie prüfen unter anderem RLS, Rechte, atomare Buchungen, Wiederholungen, Stornos und deaktivierte Mitglieder. Der Live-Betrieb mit Supabase Realtime, Benutzerkonten und mehreren iPhones muss nach der Einrichtung separat abgenommen werden.

## Aufbau

| Bereich                | Inhalt                                                             |
| ---------------------- | ------------------------------------------------------------------ |
| `app/`                 | Next.js-Seite, Layout und responsive Gestaltung                    |
| `components/`          | Anmeldung, Gruppenstart, Dashboard und Eingabeformulare            |
| `lib/`                 | Datenzugriff, Auswertungen, Demo und spätere OCR-Schnittstelle     |
| `supabase/migrations/` | Datenmodell, RLS, Buchungsfunktionen und Realtime-Veröffentlichung |
| `tests/`               | Fachliche Tests und SQL-Integrationstests                          |

## Dokumentation

- [Einrichtung und Bereitstellung](docs/setup.md)
- [Produkt und Rollen](docs/product.md)
- [Architektur und Synchronisierung](docs/architecture.md)
- [Datenmodell und Kostenberechnung](docs/data-model.md)
- [Spätere Screenshot-Erkennung](docs/screenshot-recognition.md)
- [Stand und nächste Schritte](docs/roadmap.md)

## Für später vorgemerkt

Screenshot-Upload und DeepSeek-Erkennung sind **noch nicht aktiviert**. `lib/recognition.ts` definiert die Schnittstelle; es gibt keine OCR-Aufrufe, keinen Bildspeicher und keine dafür benötigten API-Schlüssel in Version 1. Weitere geplante Erweiterungen: CSV-Export, Monatsabschluss, Guthabenübertragungen, Paketkorrekturen und Verfall. Konkrete Erkennungsregeln stehen in der [OCR-Planung](docs/screenshot-recognition.md).

## Private Daten bei der Entwicklung

Speichere lokale Zugangsdaten in `.env.local` und echte Fahrtbilder oder Datenexporte im Ordner `private/` ausserhalb von `public/`. Git ignoriert diese Pfade. Die Datei `.env.example` enthält öffentliche Platzhalter. Alles unter `public/` kann die Webseite ausliefern.

Prüfe vor einem Commit mit `git diff --cached`, was veröffentlicht wird. Git berücksichtigt auch Änderungen an bereits versionierten Dateien. Falls ein geheimer Schlüssel veröffentlicht wurde, widerrufe ihn beim Anbieter und ersetze ihn.

## Lizenz

Minutenclub ist Open Source. Die MIT-Lizenz erlaubt die Nutzung, Änderung und Weitergabe des Codes unter Beibehaltung des Lizenz- und Urheberrechtshinweises. [Lizenztext](LICENSE)
