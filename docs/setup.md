# Supabase und Vercel einrichten

[Zur Übersicht](../README.md)

Diese Schritte werden einmal für eure Crew erledigt. GitHub enthält den Code; Vercel liefert die Webseite aus; Supabase speichert die gemeinsamen Daten und übernimmt Login und Live-Abgleich. Ein kostenpflichtiger OCR-Dienst ist für diese Version nicht erforderlich.

## 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) ein Konto erstellen und ein neues Projekt anlegen.
2. Eine EU-Region auswählen, möglichst nahe an Zürich. Das Datenbankpasswort sicher speichern.
3. Im **SQL Editor** die Dateien aus der folgenden Tabelle in der angegebenen Reihenfolge ausführen. Bei einer bestehenden Datenbank beim ersten noch ausstehenden Schritt beginnen.
4. Unter **Project Settings → API / API Keys** die Projekt-URL und den Publishable Key für die Web-App kopieren. Auch der bisherige öffentliche Anon-Key wird unterstützt. Die App greift über persönliche Sitzungen, RLS und die SQL-Funktionen auf die gemeinsamen Daten zu.

| Reihenfolge                                                                      | Zweck                                                    |
| -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [202611180001](../supabase/migrations/202611180001_initial.sql)                  | Grundschema, Mitglieder, Fahrten und Journal             |
| [202611190001](../supabase/migrations/202611190001_names_and_cancellations.sql)  | Anzeigenamen und Storno-Akteur                           |
| [202611190002](../supabase/migrations/202611190002_shared_topups.sql)            | Gemeinsame Pakete mit Beitragszeilen                     |
| [202611190003](../supabase/migrations/202611190003_locations_and_feedback.sql)   | Optionale Fahrtorte und Feedback                         |
| [202611190004](../supabase/migrations/202611190004_username_auth_and_resets.sql) | Benutzerkonten und Passwortanfragen                      |
| [202611190005](../supabase/migrations/202611190005_security_and_rate_limits.sql) | Einladungsprüfung, Widerruf und Anfragelimits            |
| [202611190006](../supabase/migrations/202611190006_package_splits.sql)           | Gleichteilung und Minutenbedarf im vorhandenen Paket-RPC |
| [202611190007](../supabase/migrations/202611190007_shared_rides.sql)             | Gemeinsame Fahrten                                       |
| [202611190008](../supabase/migrations/202611190008_dev_telemetry_and_places.sql) | Fahrt-Telemetrie und Crew-Orte                           |
| [20261120064455](../supabase/migrations/20261120064455_onboarding_features.sql)  | Persönlicher Tourfortschritt                             |

## Bestehende Installation aktualisieren

Spiele die ausstehenden Migrationen in der angegebenen Reihenfolge vor dem zugehörigen Frontend ein. Die Tour-Migration markiert die bisherigen Grundlagen für Mitglieder mit früherer Anmeldung als bekannt. Konten vor ihrer ersten Anmeldung erhalten die vollständige Einführung. Für die lokale Demo entfällt der SQL-Schritt.

Zum Aktualisieren eines lokalen Windows-Checkouts zuerst den Entwicklungsserver mit `Ctrl+C` stoppen, dann:

```powershell
cd C:\privatedev\dott-minuten
git pull
npm.cmd run dev
```

## Handyansicht auf dem Laptop

In Chrome oder Edge die App öffnen, `F12` drücken und danach mit `Ctrl+Shift+M` die Geräteansicht einschalten. Ein iPhone-Gerät wählen oder eine Breite von 390 Pixeln einstellen. Bei manchen Laptops ist für die Entwicklertools `Fn+F12` nötig. Erneutes `Ctrl+Shift+M` schaltet zur normalen Ansicht zurück. Dies prüft das responsive Layout, simuliert aber nicht sämtliche Eigenheiten von echtem Safari auf einem iPhone.

## 2. Konten und Supabase Edge Functions einrichten

Die Web-App meldet Personen mit Benutzername und Passwort an. Intern bildet sie den Benutzernamen auf eine technische Auth-Adresse ab. Der E-Mail-/Passwort-Provider von Supabase muss dazu aktiv sein. Die normalen Konten entstehen über die Funktionen der App. Für eine geschlossene Crew die öffentliche Selbstregistrierung im Auth-Dienst deaktivieren, sodass die Anlage über den vorgesehenen Einladungsablauf erfolgt.

Stelle die beiden Edge Functions in demselben Supabase-Projekt wie die Migrationen bereit. Mit installierter und angemeldeter Supabase CLI aus dem Repository-Stamm (ersetze `PROJECT_REF` mit der Projektkennung):

```sh
supabase functions deploy public-account --project-ref PROJECT_REF --no-verify-jwt
supabase functions deploy admin-account --project-ref PROJECT_REF --no-verify-jwt
```

`public-account` muss vor einer Anmeldung für Registrierung und Rücksetzanfragen erreichbar sein. `admin-account` prüft selbst das übermittelte Sitzungstoken per `auth.getUser` und die Gruppenberechtigung. Die gehosteten Funktionen verwenden die projektseitig bereitgestellten Variablen `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY`. Der Service-Role-Key bleibt in der Supabase-Laufzeit. Für die Web-App genügt der öffentliche Projekt-Key.

Registriere das Gründerkonto beim Einrichten des leeren Projekts und erstelle den Club, bevor du die Adresse verteilst. Sobald ein Konto in `user_accounts` oder eine Gruppe existiert, benötigt die Registrierung über die App eine gültige Einladung. Teste den zweiten Zugang mit dem Einladungslink und anschliessend die Funktion «Passwort vergessen?» zusammen mit dem Admin.

## 3. Lokal mit echten Daten testen

```sh
npm ci
cp .env.example .env.local
```

In `.env.local` die beiden Platzhalter ersetzen:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://DEIN_PROJEKT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=DEIN_PUBLISHABLE_KEY
```

Danach `npm run dev` starten und `http://localhost:3000` öffnen. Nach Änderungen an Umgebungsvariablen den Entwicklungsserver neu starten. Der Publishable Key ist absichtlich öffentlich; der Zugriff auf Daten wird durch Anmeldung und RLS abgesichert.

## 4. Bei Vercel veröffentlichen

1. Auf [vercel.com](https://vercel.com) ein Konto erstellen und mit GitHub verbinden.
2. **Add New → Project → Import Git Repository** wählen und `dnd67/dott-minuten` importieren.
3. Das Framework **Next.js**, das Repository-Hauptverzeichnis als Root und die Standardbefehle verwenden: Installation `npm ci`, Build `npm run build`. Node.js 24 LTS auswählen, soweit angeboten; mindestens 22.
4. Die Variablen aus `.env.example` mit den echten Werten unter **Environment Variables** für **Production** hinterlegen. Um das vorbereitete **Feedback-Fenster** beim Launch scharfzuschalten, zusätzlich `NEXT_PUBLIC_FEEDBACK_ENABLED=true` setzen (ohne diese Variable speichert das Feedback-Fenster lokal im Vorschau-Modus).
5. **Deploy** ausführen. Vercel liefert eine HTTPS-Adresse wie `https://DEIN-PROJEKT.vercel.app`.
6. Die produktive Adresse als **Site URL** im Supabase-Projekt hinterlegen und Einladungslinks über diese Adresse erzeugen.
7. Die Vercel-Adresse öffnen und Anmeldung sowie den Beitritt per Einladung testen. Wenn die Variablen erst nach dem ersten Build gesetzt wurden, ein neues Deployment starten: `NEXT_PUBLIC_`-Werte werden beim Build eingebaut.

Vorschau-Deployments sollen ein separates Supabase-Testprojekt verwenden. Keine beliebigen Redirect-Wildcards und keine echten Gruppendaten für öffentliche Demos verwenden. Die Demo bleibt auch bei konfiguriertem Backend separat auswählbar.

Es gibt keine zusätzlichen Vercel-Server-Secrets oder OCR-API-Schlüssel. Die kritischen Schreiboperationen laufen als authentifizierte Datenbankfunktionen in Supabase.

## 5. Eure Gruppe starten

1. Oskar meldet sich an und erstellt beispielsweise die Gruppe **Zürich Crew**. Er wird der erste Admin.
2. Unter **Mitglieder → Einladung erstellen** einen Code erzeugen. Dieser ist sieben Tage gültig und kann während dieser Zeit von mehreren Freunden verwendet werden. Nur privat mit der Crew teilen.
3. August und Max öffnen dieselbe Webseite, melden sich jeweils an und wählen **Ich habe schon einen Einladungscode**. Ihren eigenen Namen und den Code eingeben.
4. Weitere Mitglieder treten auf demselben Weg bei. Es gibt keine fest eingebaute Begrenzung auf drei Personen.
5. Ein Admin öffnet **Guthaben → Guthaben aufladen** und erfasst Paketminuten und Preis. Wählt Gleichteilung, individuellen Minutenbedarf oder bezahlte CHF-Beiträge. Nach **Speichern** sind die Anteile bereits gutgeschrieben. [Beispiele für alle drei Varianten](benutzerhandbuch.md)
6. Jede Person erfasst nur ihre eigenen Fahrten. Ein Admin kann falsche Fahrten stornieren; die richtige Fahrt wird danach neu eingetragen.

Neue Mitglieder starten bei 0 Minuten. Negatives Guthaben ist sichtbar und verhindert das nachträgliche Erfassen einer tatsächlich gefahrenen Fahrt nicht. Einladungen laufen nach 7 Tagen automatisch ab und lassen sich jederzeit über **Mitglieder → Links sperren** sofort widerrufen.

## 6. Auf dem iPhone installieren

Die HTTPS-Webseite in Safari öffnen, **Teilen → Zum Home-Bildschirm** wählen und hinzufügen. Die App hat einen eigenen Namen und ein Icon. Es gibt in dieser Version keinen Service Worker: Oberfläche, Login und Buchungen brauchen eine Verbindung. Geöffnete Sitzungen laden nach einer Rückkehr aus dem Hintergrund erneut.

## 7. Vor dem täglichen Einsatz prüfen

- Zwei unterschiedliche Logins auf zwei Geräten verwenden, beide in derselben Gruppe.
- 600 Minuten für CHF 90.00 aufladen, im Modus «Nach CHF-Beitrag» mit Beiträgen von CHF 30.00 / 45.00 / 15.00: 200 / 300 / 100 Minuten müssen gutgeschrieben werden. Eine Wiederholung desselben Speicheraufrufs darf weder Paket noch Gutschriften verdoppeln.
- Auf der Startseite eigenes Restguthaben, eigenen Verbrauch und Gruppenrest vergleichen. Das Diagramm zeigt pro Mitglied das gesamte Kontingent hinter dem bereits verbrauchten Anteil. Stornos verändern nicht das Kontingent.
- Mit Oskar eine Fahrt von 14 Minuten und 1 Minute Pause eintragen: genau 15 Minuten Verbrauch.
- Auf dem zweiten Gerät die aktualisierte Fahrt und den Saldo prüfen. Ein manuelles Neuladen darf nicht nötig sein; bei ausgefallenem Realtime greift spätestens der 30-Sekunden-Abgleich im sichtbaren Fenster.
- Das zweite Gerät in den Hintergrund schicken, eine Änderung vornehmen und zurückkehren: neuer Stand wird geladen.
- Verbindung unterbrechen: Offline-Hinweis, keine falsche Speicherbestätigung. Danach erneut versuchen; ein bereits verarbeiteter identischer Versuch darf keine zweite Buchung erzeugen.
- Als normales Mitglied prüfen, dass keine Guthaben-, Rollen- oder Paketänderungen möglich sind.
- Eine Fahrt als Admin stornieren: ursprüngliche Fahrt bleibt erhalten und genau eine Gegenbuchung entsteht.
- Mit zwei persönlichen Benutzernamen abmelden und erneut anmelden. Eine Passwortanfrage im Admin-Dashboard bearbeiten und das neue Passwort testen.

Automatisierte lokale Prüfungen ersetzen diesen Test der echten Auth-, Hosting- und Realtime-Dienste nicht. Ein echter iPhone-Test ist nach der Einrichtung noch auszuführen.

## Betrieb und Grenzen

Vor dem produktiven Einsatz die aktuellen kostenlosen Tarife, Projektpausierung bei Inaktivität, Funktionslimits und Backup-Möglichkeiten prüfen. Kostenloses Hosting ist kein zugesicherter 24/7-Betrieb. Für Supabase ein passendes Datenbankbackup einrichten und eine Wiederherstellung testen. Die App enthält keinen Storage-Bucket, da noch keine Bilder hochgeladen werden.

Die Kostenübersicht zeigt geschätzte Paketverbrauchswerte und dokumentierte Paketkäufe. Sie wickelt keine Zahlungen ab. Paketverfall, Paket-/Guthabenkorrekturen, automatische Ausgleichszahlungen und Backups werden nicht von der App selbst durchgeführt.

Bei «Funktion nicht gefunden» zuerst prüfen, ob die Migration vollständig im richtigen Supabase-Projekt ausgeführt wurde. Bei «Kein Zugriff» prüfen, ob der Login aktiv ist und die Person der Gruppe beigetreten ist. Bei ausbleibendem Live-Abgleich im Supabase-Dashboard kontrollieren, ob die Tabellen der Publikation `supabase_realtime` zugeordnet sind; die Migration erledigt dies normalerweise bereits.

## 8. DDoS- & Missbrauchsschutz

- **Invite-Only-Registrierung (`public-account`):** Sobald das erste Gründer-Konto existiert, lehnt `public-account` jede Selbstregistrierung ohne aktiven, nicht abgelaufenen Einladungscode mit HTTP `403` ab, bevor ein Eintrag in `auth.users` angelegt wird. Alternativ können Admins Konten direkt im Passwort-Dashboard anlegen (`admin-account`).
- **Datenbankgestütztes Rate-Limiting (`app_private.rate_limits`):** Gehashte Client-IPs sind auf maximal 5 Aufrufe pro 10 Minuten begrenzt (zusätzlich globaler Schutzschalter von 30 Aufrufen pro 10 Minuten gegen verteilte Botnetze); Überschreitungen liefern HTTP `429`.
- **Vercel WAF & Browser-Hardening (`vercel.json` & `next.config.ts`):** Typische Scanner-Pfade (`/.env`, `/.git`, `/wp-admin` usw.) werden direkt an der Vercel-Edge mit `deny` (`403`) verworfen, Anfragen ausserhalb Europas (`x-vercel-ip-continent != EU`) erhalten eine automatische Browser-Challenge (`challenge`), und HSTS + Content-Security-Policy schützen im Browser.
