# Datenmodell und Abrechnung

[Zur Übersicht](../README.md) · [Grundschema](../supabase/migrations/202611180001_initial.sql) · [Namen und Storno-Verlauf](../supabase/migrations/202611190001_names_and_cancellations.sql) · [Gemeinsame Aufladung](../supabase/migrations/202611190002_shared_topups.sql)

## Implementierte Tabellen

| Tabelle                 | Zweck                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `groups`                | Gemeinsamer Club, Ersteller und Schlüssel zur wiederholbaren Erstellung                                                   |
| `memberships`           | Persönlicher Auth-Zugang (nach Kontolöschung `NULL`), Anzeigename, Gruppe, Rolle und Aktivstatus                          |
| `invitations`           | Zufälliger Einladungscode, Gruppe und Ablauf nach sieben Tagen                                                            |
| `rides`                 | Fahrer, Zeitpunkt, Fahrsekunden, Pausensekunden, Summe, Herkunft, Regelversion, optionale Kostenschätzung und Stornierung |
| `minute_entries`        | Unveränderliche Gutschriften, Fahrtverbräuche und Gegenbuchungen mit Grund und Ersteller                                  |
| `package_contributions` | CHF-Beitrag und Minutenanteil je Paket und Mitglied; RLS wie Gruppendaten                                                 |
| `packages`              | Tatsächlich erfasste Käufe: Minuten, Preis in Rappen, Käufer, Zeitpunkt und Notiz                                         |
| `app_private.commands`  | Idempotenzschlüssel mit Aktion und Nutzdaten; für Browser nicht lesbar                                                    |

Weitere Bereiche sind die optionalen Ortsfelder an Fahrten, Gruppenfeedback in `feedback`, die Zuordnung von Benutzernamen in `user_accounts` und Passwortanfragen in `password_reset_requests`. Die Konto-Funktionen nutzen serverseitige Berechtigungen. `app_private.rate_limits` zählt Anfragen in Zeitfenstern. [Orte und Feedback](../supabase/migrations/202611190003_locations_and_feedback.sql) · [Benutzerkonten](../supabase/migrations/202611190004_username_auth_and_resets.sql) · [Einladungen und Limits](../supabase/migrations/202611190005_security_and_rate_limits.sql)

Tabellenbeziehungen sichern Gruppenidentität und Personenbezüge über zusammengesetzte Fremdschlüssel ab. Alle öffentlichen Tabellen sind durch RLS geschützt. Schreibrechte existieren ausschliesslich über die vorgesehenen RPCs.

Namensänderungen verändern ausschliesslich `memberships.display_name`. Die Person darf den eigenen Anzeigenamen innerhalb der Gruppe ändern; Admins dürfen auch andere Mitglieder umbenennen. Die RPC `rename_member` prüft Berechtigung, Gruppenbezug, Länge (1–60 Zeichen) und Idempotenz. Historische Fahrten und Journalbezüge behalten ihre IDs und zeigen den aktuellen Anzeigenamen.

## Zeit und Guthaben

Die erste Eingabeoberfläche verwendet **ganze Minuten**, intern speichert die Datenbank ganze Sekunden. Zeitpunkte werden als `timestamptz` gespeichert. Eingaben beziehen sich auf die lokale Gerätezeitzone; die Fahrtenliste und die Tagesgrenzen der Übersicht verwenden `Europe/Zurich`.

```text
Verbrauch = Fahrsekunden + Pausensekunden
Persönliches Guthaben = Summe aller eigenen Journalbeträge
Gemeinsamer Bestand = Summe gekaufter Paketzeit - nicht stornierter Verbrauch
Noch nicht zugewiesen = gemeinsamer Bestand - Summe aller persönlichen Guthaben
```

14 Minuten Fahrt + 1 Minute Pause = 900 Sekunden beziehungsweise 15 Minuten Verbrauch. `charged_seconds` ist eine generierte Datenbankspalte. Die Gruppe hat bestätigt, dass Pausen zählen. **Freischaltgebühren werden ignoriert.** Die Oberfläche fragt keine solchen Gebühren ab.

Interne Gutschriften sind frei wählbare positive Ganzminutenbeträge bis zur technischen Eingabegrenze von 10 Millionen Minuten pro Buchung. Eine Gutschrift kauft kein Dott-Paket. Übersteigt die Zuweisung den erfassten gemeinsamen Bestand, wird eine Unterdeckung sichtbar. Negative persönliche Salden bleiben erlaubt, damit tatsächliche Fahrten auch nachträglich erfasst werden können.

## Transaktionen, Rechte und Korrekturen

- Ein Mitglied erfasst nur eigene Fahrten. Die Person wird serverseitig aus dem Login abgeleitet.
- Alle aktiven Mitglieder können Minutenpakete über `record_topup` erfassen und aufteilen. Admins können zusätzlich kostenlose interne Gutschriften (`credit_minutes`) buchen, den alten Kompatibilitäts-RPC `record_package` aufrufen und Fahrten stornieren (`void_ride`).
- Eine Fahrt erzeugt genau einen negativen Journalbetrag, eine Stornierung genau eine Gegenbuchung. `voided_by_member_id` referenziert die ausführende Mitgliedschaft derselben Gruppe; `voided_at` und `void_reason` halten Zeitpunkt und Grund fest. Die Originalfahrt bleibt erhalten und wird aus aktiven Statistiken herausgenommen.
- Ein identischer Schreibversuch mit gleichem Idempotenzschlüssel ist wirkungslos. Abweichende Nutzdaten mit demselben Schlüssel werden zurückgewiesen.
- Alle Mutationen prüfen zuerst die aktive Mitgliedschaft und sperren die Gruppe für die kurze Transaktion. Eine fehlgeschlagene Aktion hinterlässt keine Teilbuchungen oder reservierten Idempotenzschlüssel.
- Korrekturen einer Fahrt erfolgen durch Storno und neue eigene Erfassung. Direkte Änderungen oder Löschungen im Journal sind nicht zulässig.

Version 1 bietet keine negativen administrativen Guthabenkorrekturen, Minutenübertragungen oder Paketkorrekturen. Diese benötigen eigene Gegenbuchungsfunktionen und sind als Erweiterung vorgemerkt. Im täglichen Betrieb echte Käufe und Gutschriften vor dem Speichern prüfen; Testeinträge für Admin-Buchungen gehören in ein separates Testprojekt.

## Aufteilung eines Pakets

Die RPC `record_topup` prüft aktive Gruppenmitgliedschaft (für alle aktiven Mitglieder, nicht nur Admins), aktive Mitglieder derselben Gruppe für Käufer und Anteile, eindeutige Beitragszeilen, ganze nicht negative Rappenbeträge und einen positiven Paketpreis. Alle Beiträge müssen zusammen den Preis ergeben. Sie legt Paket und Beitragszeilen an und schreibt die entsprechenden Minuten über `minute_entries` gut. `minute_entries.package_id` stellt die Verbindung her. Nullbeiträge sind erlaubt; Null-Minuten-Anteile erzeugen keinen Journalbetrag.

Im Modus «Nach CHF-Beitrag» entspricht die Minutenzuteilung `Paketminuten × Beitrag / Paketpreis`. Zunächst wird je Person auf ganze Minuten abgerundet. Die übrigen Minuten erhalten die grössten Nachkommareste, bei Gleichstand die niedrigere feste Mitglieds-ID. Die Summe entspricht exakt den gekauften Minuten. Die Datenbank verwendet exakte Dezimalrechnung, die Vorschau BigInt-Brüche. Beispiel: 600 Minuten für CHF 90, Beiträge 30/45/15 → 200/300/100 Minuten.

«Fair aufteilen» (`equal`) gewichtet jedes ausgewählte Mitglied mit eins. Bei «Nach Minutenbedarf» ergeben die eingegebenen Ganzminuten zusammen exakt die Paketgrösse. Der Server verteilt Minuten und Rappen jeweils aus den ursprünglichen Gewichten. Auch bei einem Paket zu einem Rappen bleiben damit vorgegebene Minutenanteile exakt. Gespeichert werden die resultierenden Beträge und Sekunden. Die Anzeige kann historische Ergebnisse direkt lesen. [Migration zur Paketaufteilung](../supabase/migrations/202611190006_package_splits.sql) · [Freigabe für Mitglieder](../supabase/migrations/202611200001_member_packages.sql)

Kauf, Beiträge, Gutschriften und Idempotenz sind eine gemeinsame Transaktion. Ein fehlerhafter oder nur teilweise finanzierter Kauf speichert nichts. Der alte RPC `record_package` bleibt aus Kompatibilitätsgründen ausschliesslich für Admins bestehen; die aktuelle Aufladeoberfläche verwendet ausschliesslich `record_topup`. Für ältere Käufe ohne Beitragsdaten werden keine Zahlungen oder zusätzlichen Gutschriften erfunden.

Das Diagramm verwendet `Kontingent = Summe aller credit-Einträge`, `Verbrauch = aktive Fahrten` und `Restguthaben = gesamtes Journal`. Gegenbuchungen von Stornos erhöhen nicht das Kontingent. Überschreitet der Verbrauch das Kontingent, wird der gefüllte Balken höher als der transparente und der negative Rest sichtbar.

## Kostenübersicht

CHF-Eingaben werden exakt in ganze Rappen umgerechnet. Paketkäufe dokumentieren, wer bezahlt hat. Gemeinsame Aufladungen dokumentieren die Kosten- und Minutenanteile pro Person; sie lösen keine tatsächlichen Überweisungen aus. Kostenlose manuelle Gutschriften kaufen keine Pakete.

Die Fahrtkosten sind **ausschliesslich eine Schätzung**. Bei Erfassung einer Fahrt bestimmt die Datenbank den gewichteten Preis sämtlicher bereits erfasster Pakete mit Kaufzeitpunkt vor oder gleich dem Fahrtzeitpunkt:

```text
Geschätzte Fahrtkosten in Rappen
  = verbrauchte Sekunden × Summe Paketpreise / Summe Paketsekunden
```

Diese Schätzung wird mit der Fahrt gespeichert und später nicht automatisch verändert. Historische Fahrten, die vor der Eingabe ihrer Paketkäufe erfasst wurden, können deshalb weiterhin offene Kosten haben. Freischaltung, sichtbarer Screenshot-Gesamtpreis und durchgestrichene Tarife werden nicht addiert. Beispiel: 600 Minuten für CHF 90.00 ergeben bei 15 Minuten Verbrauch geschätzte CHF 2.25.

Fehlen geeignete Pakete, ist die Bewertung `NULL` und wird als offen angezeigt. Sie wird nicht mit bestätigten Nullkosten verwechselt. Die Statistik nennt die Anzahl unbewerteter Fahrten neben der Summe der bekannten Schätzungen. Zwischenwerte bleiben dezimal; die Anzeige rundet auf Rappen. Da keine Ausgleichszahlungen daraus erzeugt werden, behauptet die App keine centgenaue Verteilung sämtlicher Käufe.

Es gibt keine belegte Zuordnung von Fahrten zu bestimmten Dott-Paketen und keine automatische Erfassung von Paketverfall. Der gemeinsame Bestand ist ein berechneter Stand aus euren Eingaben, kein Live-Abruf bei Dott. Falls später Verfall ergänzt wird, darf bereits erfasster Verbrauch nicht nochmals als verfallen abgezogen werden.

## Kontolöschung und Anonymisierung

Die selbstständige Kontolöschung erfolgt über die Migration [202611200002_account_deletion.sql](../supabase/migrations/202611200002_account_deletion.sql) und die dedizierte Supabase Edge Function `delete-account` (`supabase/functions/delete-account/index.ts`, ohne Gruppenpflicht).

- **Nullable- und `ON DELETE SET NULL`-Fremdschlüssel:** `memberships.user_id` sowie die Audit-Spalten `groups.created_by`, `minute_entries.created_by`, `feedback.created_by` und `group_places.created_by` sind nullable und referenzieren `auth.users(id)` mit `ON DELETE SET NULL` (inklusive Indizes auf `minute_entries(created_by)`, `feedback(created_by)`, `group_places(created_by)` und `password_reset_requests(target_user_id)`). Da PostgreSQL `NULL`-Werte in `UNIQUE (group_id, user_id)` und `UNIQUE (created_by, request_id)` als verschieden behandelt, können mehrere gelöschte Konten in derselben Gruppe nebeneinander bestehen, während sämtliche Journal- und Fahrtenbezüge über `memberships(group_id, id)` erhalten bleiben. `user_accounts.user_id` und `password_reset_requests.target_user_id` verbleiben auf `ON DELETE CASCADE`.
- **Zweistufiger Ablauf (`delete-account` → `prepare_account_deletion` → `auth.admin.deleteUser`):** `delete-account` prüft das Bearer-Token per `auth.getUser`, verlangt `{ confirm: true }` und wendet `check_public_rate_limit` an. Zuerst ruft sie die `SECURITY DEFINER`-Funktion `public.prepare_account_deletion(p_user_id uuid)` auf (`search_path = ''`, für `public`, `anon` und `authenticated` gesperrt, ausschliesslich für `service_role` ausführbar):
  - sperrt alle betroffenen Gruppen in aufsteigender `group_id`-Reihenfolge (`FOR UPDATE`) und arbeitet bei Wiederholungsversuchen vollständig idempotent,
  - befördert beim Wegfall des letzten aktiven Admins automatisch das dienstälteste verbleibende aktive Mitglied (`created_at ASC, id ASC`) zum `admin`, oder lässt beim Wegfall des letzten aktiven Mitglieds alle offenen `invitations` dieser Gruppe sofort ablaufen,
  - deaktiviert und anonymisiert alle Mitgliedschaften des Kontos (`active = false`, `role = 'member'`, `display_name = 'Gelöschtes Konto'`), belässt `user_id` aber bis zum zweiten Schritt gesetzt,
  - löscht eigene Einträge in `public.feedback`, entfernt personenbezogene `rename`-/`feedback`-Idempotenzeinträge aus `app_private.commands` (Finanz- und Fahrt-Idempotenz bleibt erhalten) sowie `app_private.rate_limits` (`admin:<uid>`).
- **Atomarer Auth-Abschluss:** Danach löscht `delete-account` den Auth-Eintrag über `auth.admin.deleteUser(uid, false)`. In derselben Datenbanktransaktion entfernt `ON DELETE CASCADE` sowohl `user_accounts` (gibt den Benutzernamen zeitgleich frei) als auch `password_reset_requests`, und `ON DELETE SET NULL` setzt `memberships.user_id` sowie alle `created_by`-Audit-Spalten auf `NULL`.
- **Schutzregeln für gelöschte Mitgliedschaften:** `update_member`, `rename_member` und `admin-account` lehnen Änderungen, Umbenennungen und Passwort-Resets für Mitgliedschaften mit `user_id IS NULL` ab; die Prüfung auf den letzten aktiven Admin zählt nur aktive Admins mit `user_id IS NOT NULL`. `registration_requires_invite()` prüft auf vorhandene `user_accounts` oder aktive `memberships`, damit nach der Löschung eines alleinigen Gründerkontos keine dauerhafte Aussperrung entsteht.

## Grenzen und spätere Erweiterungen

Noch nicht angelegt sind Bildspeicher, Upload-Aufträge, OCR-Ergebnisse, zusätzliche paketunabhängige Zahlungen und konkrete Dott-Paketverbrauchszuordnungen. Die SQL-Spalte `source` ist vorbereitet, erlaubt per Constraint aber zunächst ausschliesslich `manual`. Erst eine eigene Migration und geprüfte serverseitige Verarbeitung dürfen `ocr` freigeben. Deaktivierung erhält die Historie mit verknüpftem Konto; die direkte Selbstlöschung mit Anonymisierung als «Gelöschtes Konto» ist wie oben beschrieben über `202611200002_account_deletion.sql` und `delete-account` umgesetzt.
