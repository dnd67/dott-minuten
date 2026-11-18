# Supabase und Vercel einrichten

[Zur Übersicht](../README.md)

Diese Schritte werden einmal für eure Crew erledigt. GitHub enthält den Code; Vercel liefert die Webseite aus; Supabase speichert die gemeinsamen Daten und übernimmt Login und Live-Abgleich. Ein kostenpflichtiger OCR-Dienst ist für diese Version nicht erforderlich.

## 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) ein Konto erstellen und ein neues Projekt anlegen.
2. Eine EU-Region auswählen, möglichst nahe an Zürich. Das Datenbankpasswort sicher speichern.
3. Im **SQL Editor** die gesamte Datei [202611180001_initial.sql](../supabase/migrations/202611180001_initial.sql) einfügen und einmal ausführen. Sie erstellt Tabellen, Zugriffsschutz, Buchungsfunktionen und die Realtime-Freigaben gemeinsam in einer Transaktion.
4. Bei Erfolg erscheinen `groups`, `memberships`, `rides`, `minute_entries`, `packages` und `invitations` im Table Editor. Das Schema `app_private` enthält interne Hilfsfunktionen und die Idempotenzverwaltung.
5. Unter **Project Settings → API / API Keys** die Projekt-URL und den **Publishable Key** kopieren. Falls das Projekt noch Legacy Keys verwendet, funktioniert auch der **anon public** Key.

Keine Tabellen für anonymen Schreibzugriff öffnen. Die Migration enthält bereits sämtliche erforderlichen Berechtigungen. Keine Service-Role-Keys im Browser oder in `NEXT_PUBLIC_`-Variablen verwenden.

Die Migration ist eine initiale Migration für ein leeres Projekt. Nicht erneut über eine vorhandene Installation ausführen; spätere Schemaänderungen erhalten eine eigene Migration. Alternativ kann sie mit der Supabase CLI als reguläre Migration angewendet werden.

## 2. E-Mail-Anmeldung konfigurieren

Die App unterstützt einen E-Mail-Code direkt in der App sowie alternativ einen Anmeldelink. Jede Person braucht eine eigene E-Mail-Adresse und tritt danach eurer Gruppe bei.

1. In Supabase unter **Authentication → Providers / Sign In** den E-Mail-Provider aktivieren und Neuregistrierungen erlauben. Die Einladung begrenzt den Gruppenzugang, nicht die Registrierung eines Logins.
2. Für lokale Tests in **Authentication → URL Configuration** als Site URL `http://localhost:3000` und als erlaubte Redirect URL ebenfalls `http://localhost:3000` setzen.
3. Unter **Authentication → Email Templates → Magic Link** den Anmeldecode `{{ .Token }}` in die E-Mail-Vorlage aufnehmen. Zum Beispiel:

   ```html
   <h2>Dein Minutenclub-Anmeldecode</h2>
   <p>{{ .Token }}</p>
   <p>Gib diesen Code in deiner App ein.</p>
   <p>Alternativ: <a href="{{ .ConfirmationURL }}">Im Browser anmelden</a></p>
   ```

   Der Code lässt sich direkt in der installierten Web-App eingeben und vermeidet einen Wechsel in einen anderen Browser. Einladungs- und Anmeldecode sind unterschiedliche Codes.

4. **Für eure Freunde einen eigenen SMTP-Versand konfigurieren.** Supabases eingebauter Test-Mailversand ist eingeschränkt und in der Regel nur für vorab autorisierte Projektteam-Adressen nutzbar. Ein funktionierender Login für den Projektinhaber beweist noch keine Zustellung an August oder Max. Unter **Authentication → Email / SMTP Settings** einen Mailanbieter konfigurieren, dessen Absender- und Empfängerregeln zu euch passen.
5. SMTP-Zugangsdaten ausschliesslich in Supabase hinterlegen. Der Mailanbieter kann eigene Kosten, Limits oder eine verifizierte Absenderdomain verlangen. Vorher aktuelle Tarife prüfen; für die Webadresse selbst ist keine eigene Domain notwendig.

Bevorzugt den Anmeldecode in derselben App eingeben, in der ihr begonnen habt. Anmeldelinks auf demselben iPhone öffnen, auf dem ihr die App verwenden wollt; eine Anmeldung in Safari muss nicht mit einer separat installierten Web-App geteilt werden. Keine gemeinsame E-Mail-Anmeldung benutzen. Einladungslinks/-codes und Anmeldelinks sind verschiedene Dinge: Der Anmeldelink öffnet den persönlichen Zugang, der Einladungscode verbindet ihn mit der Crew.

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
4. Die beiden Variablen aus `.env.example` mit den echten Werten unter **Environment Variables** für **Production** hinterlegen.
5. **Deploy** ausführen. Vercel liefert eine HTTPS-Adresse wie `https://DEIN-PROJEKT.vercel.app`.
6. Diese genaue Adresse in Supabase als **Site URL** und **Redirect URL** eintragen. Die lokale Redirect URL nur behalten, wenn weiterhin lokal getestet wird.
7. Die Vercel-Adresse öffnen und den Anmeldelink testen. Wenn die Variablen erst nach dem ersten Build gesetzt wurden, ein neues Deployment starten: `NEXT_PUBLIC_`-Werte werden beim Build eingebaut.

Vorschau-Deployments sollen ein separates Supabase-Testprojekt verwenden. Keine beliebigen Redirect-Wildcards und keine echten Gruppendaten für öffentliche Demos verwenden. Die Demo bleibt auch bei konfiguriertem Backend separat auswählbar.

Es gibt keine zusätzlichen Vercel-Server-Secrets oder OCR-API-Schlüssel. Die kritischen Schreiboperationen laufen als authentifizierte Datenbankfunktionen in Supabase.

## 5. Eure Gruppe starten

1. Oskar meldet sich an und erstellt beispielsweise die Gruppe **Zürich Crew**. Er wird der erste Admin.
2. Unter **Mitglieder → Einladung erstellen** einen Code erzeugen. Dieser ist sieben Tage gültig und kann während dieser Zeit von mehreren Freunden verwendet werden. Nur privat mit der Crew teilen.
3. August und Max öffnen dieselbe Webseite, melden sich jeweils an und wählen **Ich habe schon einen Einladungscode**. Ihren eigenen Namen und den Code eingeben.
4. Weitere Mitglieder treten auf demselben Weg bei. Es gibt keine fest eingebaute Begrenzung auf drei Personen.
5. Ein Admin erfasst unter **Guthaben → Paket erfassen** den tatsächlichen Paketkauf und schreibt unter **Guthaben geben** den Personen ihre jeweiligen Anteile gut. Paketkauf und Guthabenverteilung sind getrennte Aktionen.
6. Jede Person erfasst nur ihre eigenen Fahrten. Ein Admin kann falsche Fahrten stornieren; die richtige Fahrt wird danach neu eingetragen.

Neue Mitglieder starten bei 0 Minuten. Negatives Guthaben ist sichtbar und verhindert das nachträgliche Erfassen einer tatsächlich gefahrenen Fahrt nicht. Einladungen laufen automatisch ab; die Oberfläche bietet in Version 1 noch keinen vorzeitigen Widerruf. Im Bedarfsfall kann der Projektinhaber die betreffende Einladung im Supabase Table Editor löschen.

## 6. Auf dem iPhone installieren

Die HTTPS-Webseite in Safari öffnen, **Teilen → Zum Home-Bildschirm** wählen und hinzufügen. Die App hat einen eigenen Namen und ein Icon. Es gibt in dieser Version keinen Service Worker: Oberfläche, Login und Buchungen brauchen eine Verbindung. Geöffnete Sitzungen laden nach einer Rückkehr aus dem Hintergrund erneut.

## 7. Vor dem täglichen Einsatz prüfen

- Zwei unterschiedliche Logins auf zwei Geräten verwenden, beide in derselben Gruppe.
- Ein Paket erfassen und Minuten verteilen. Ohne gemeinsames Paket sind Kosten offen; Guthaben kann trotzdem erfasst werden.
- Mit Oskar eine Fahrt von 14 Minuten und 1 Minute Pause eintragen: genau 15 Minuten Verbrauch.
- Auf dem zweiten Gerät die aktualisierte Fahrt und den Saldo prüfen. Ein manuelles Neuladen darf nicht nötig sein; bei ausgefallenem Realtime greift spätestens der 30-Sekunden-Abgleich im sichtbaren Fenster.
- Das zweite Gerät in den Hintergrund schicken, eine Änderung vornehmen und zurückkehren: neuer Stand wird geladen.
- Verbindung unterbrechen: Offline-Hinweis, keine falsche Speicherbestätigung. Danach erneut versuchen; ein bereits verarbeiteter identischer Versuch darf keine zweite Buchung erzeugen.
- Als normales Mitglied prüfen, dass keine Guthaben-, Rollen- oder Paketänderungen möglich sind.
- Eine Fahrt als Admin stornieren: ursprüngliche Fahrt bleibt erhalten und genau eine Gegenbuchung entsteht.
- E-Mail-Zustellung an alle drei tatsächlichen Adressen und Abmelden/erneutes Anmelden testen.

Automatisierte lokale Prüfungen ersetzen diesen Test der echten Auth-, Hosting- und Realtime-Dienste nicht. Ein echter iPhone-Test ist nach der Einrichtung noch auszuführen.

## Betrieb und Grenzen

Vor dem produktiven Einsatz die aktuellen kostenlosen Tarife, Projektpausierung bei Inaktivität, E-Mail-Limits und Backup-Möglichkeiten prüfen. Kostenloses Hosting ist kein zugesicherter 24/7-Betrieb. Für Supabase ein passendes Datenbankbackup einrichten und eine Wiederherstellung testen. Die App enthält keinen Storage-Bucket, da noch keine Bilder hochgeladen werden.

Die Kostenübersicht zeigt geschätzte Paketverbrauchswerte und dokumentierte Paketkäufe. Sie wickelt keine Zahlungen ab. Paketverfall, Paket-/Guthabenkorrekturen, automatische Ausgleichszahlungen und Backups werden nicht von der App selbst durchgeführt.

Bei «Funktion nicht gefunden» zuerst prüfen, ob die Migration vollständig im richtigen Supabase-Projekt ausgeführt wurde. Bei «Kein Zugriff» prüfen, ob der Login aktiv ist und die Person der Gruppe beigetreten ist. Bei ausbleibendem Live-Abgleich im Supabase-Dashboard kontrollieren, ob die Tabellen der Publikation `supabase_realtime` zugeordnet sind; die Migration erledigt dies normalerweise bereits.
