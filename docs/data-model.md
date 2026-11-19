# Datenmodell und Abrechnung

[Zur Übersicht](../README.md) · [Grundschema](../supabase/migrations/202611180001_initial.sql) · [Namen und Storno-Verlauf](../supabase/migrations/202611190001_names_and_cancellations.sql) · [Gemeinsame Aufladung](../supabase/migrations/202611190002_shared_topups.sql)

## Implementierte Tabellen

| Tabelle                 | Zweck                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `groups`                | Gemeinsamer Club, Ersteller und Schlüssel zur wiederholbaren Erstellung                                                   |
| `memberships`           | Persönlicher Auth-Zugang, Anzeigename, Gruppe, Rolle und Aktivstatus                                                      |
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
- Admins können positive Gutschriften buchen, Pakete erfassen und Fahrten stornieren.
- Eine Fahrt erzeugt genau einen negativen Journalbetrag, eine Stornierung genau eine Gegenbuchung. `voided_by_member_id` referenziert die ausführende Mitgliedschaft derselben Gruppe; `voided_at` und `void_reason` halten Zeitpunkt und Grund fest. Die Originalfahrt bleibt erhalten und wird aus aktiven Statistiken herausgenommen.
- Ein identischer Schreibversuch mit gleichem Idempotenzschlüssel ist wirkungslos. Abweichende Nutzdaten mit demselben Schlüssel werden zurückgewiesen.
- Alle Mutationen prüfen zuerst die aktive Mitgliedschaft und sperren die Gruppe für die kurze Transaktion. Eine fehlgeschlagene Aktion hinterlässt keine Teilbuchungen oder reservierten Idempotenzschlüssel.
- Korrekturen einer Fahrt erfolgen durch Storno und neue eigene Erfassung. Direkte Änderungen oder Löschungen im Journal sind nicht zulässig.

Version 1 bietet keine negativen administrativen Guthabenkorrekturen, Minutenübertragungen oder Paketkorrekturen. Diese benötigen eigene Gegenbuchungsfunktionen und sind als Erweiterung vorgemerkt. Im täglichen Betrieb echte Käufe und Gutschriften vor dem Speichern prüfen; Testeinträge gehören in ein separates Projekt oder die Demo.

## Aufteilung eines Pakets

Die RPC `record_topup` prüft Admin-Rechte, aktive Mitglieder derselben Gruppe, eindeutige Beitragszeilen, ganze nicht negative Rappenbeträge und einen positiven Paketpreis. Alle Beiträge müssen zusammen den Preis ergeben. Sie legt Paket und Beitragszeilen an und schreibt die entsprechenden Minuten über `minute_entries` gut. `minute_entries.package_id` stellt die Verbindung her. Nullbeiträge sind erlaubt; Null-Minuten-Anteile erzeugen keinen Journalbetrag.

Im Modus «Nach CHF-Beitrag» entspricht die Minutenzuteilung `Paketminuten × Beitrag / Paketpreis`. Zunächst wird je Person auf ganze Minuten abgerundet. Die übrigen Minuten erhalten die grössten Nachkommareste, bei Gleichstand die niedrigere feste Mitglieds-ID. Die Summe entspricht exakt den gekauften Minuten. Die Datenbank verwendet exakte Dezimalrechnung, die Vorschau BigInt-Brüche. Beispiel: 600 Minuten für CHF 90, Beiträge 30/45/15 → 200/300/100 Minuten.

«Fair aufteilen» (`equal`) gewichtet jedes ausgewählte Mitglied mit eins. Bei «Nach Minutenbedarf» ergeben die eingegebenen Ganzminuten zusammen exakt die Paketgrösse. Der Server verteilt Minuten und Rappen jeweils aus den ursprünglichen Gewichten. Auch bei einem Paket zu einem Rappen bleiben damit vorgegebene Minutenanteile exakt. Gespeichert werden die resultierenden Beträge und Sekunden. Die Anzeige kann historische Ergebnisse direkt lesen. [Migration zur Paketaufteilung](../supabase/migrations/202611190006_package_splits.sql)

Kauf, Beiträge, Gutschriften und Idempotenz sind eine gemeinsame Transaktion. Ein fehlerhafter oder nur teilweise finanzierter Kauf speichert nichts. Der alte RPC `record_package` bleibt für Kompatibilität bestehen; die aktuelle Aufladeoberfläche verwendet ausschliesslich `record_topup`. Für ältere Käufe ohne Beitragsdaten werden keine Zahlungen oder zusätzlichen Gutschriften erfunden.

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

## Grenzen und spätere Erweiterungen

Noch nicht angelegt sind Bildspeicher, Upload-Aufträge, OCR-Ergebnisse, zusätzliche paketunabhängige Zahlungen und konkrete Dott-Paketverbrauchszuordnungen. Die SQL-Spalte `source` ist vorbereitet, erlaubt per Constraint aber zunächst ausschliesslich `manual`. Erst eine eigene Migration und geprüfte serverseitige Verarbeitung dürfen `ocr` freigeben. Deaktivierung erhält die Historie; Kontolöschung und Anonymisierung benötigen später einen separaten Ablauf.
