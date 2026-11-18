# Datenmodell und Abrechnung

[Zur Übersicht](../README.md) · [Ausführbare SQL-Migration](../supabase/migrations/202611180001_initial.sql)

## Implementierte Tabellen

| Tabelle                | Zweck                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `groups`               | Gemeinsamer Club, Ersteller und Schlüssel zur wiederholbaren Erstellung                                                   |
| `memberships`          | Persönlicher Auth-Zugang, Anzeigename, Gruppe, Rolle und Aktivstatus                                                      |
| `invitations`          | Zufälliger Einladungscode, Gruppe und Ablauf nach sieben Tagen                                                            |
| `rides`                | Fahrer, Zeitpunkt, Fahrsekunden, Pausensekunden, Summe, Herkunft, Regelversion, optionale Kostenschätzung und Stornierung |
| `minute_entries`       | Unveränderliche Gutschriften, Fahrtverbräuche und Gegenbuchungen mit Grund und Ersteller                                  |
| `packages`             | Tatsächlich erfasste Käufe: Minuten, Preis in Rappen, Käufer, Zeitpunkt und Notiz                                         |
| `app_private.commands` | Idempotenzschlüssel mit Aktion und Nutzdaten; für Browser nicht lesbar                                                    |

Tabellenbeziehungen sichern Gruppenidentität und Personenbezüge über zusammengesetzte Fremdschlüssel ab. Alle öffentlichen Tabellen sind durch RLS geschützt. Schreibrechte existieren ausschliesslich über die vorgesehenen RPCs.

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
- Eine Fahrt erzeugt genau einen negativen Journalbetrag, eine Stornierung genau eine Gegenbuchung. Die Originalfahrt bleibt erhalten und wird aus aktiven Statistiken herausgenommen.
- Ein identischer Schreibversuch mit gleichem Idempotenzschlüssel ist wirkungslos. Abweichende Nutzdaten mit demselben Schlüssel werden zurückgewiesen.
- Alle Mutationen prüfen zuerst die aktive Mitgliedschaft und sperren die Gruppe für die kurze Transaktion. Eine fehlgeschlagene Aktion hinterlässt keine Teilbuchungen oder reservierten Idempotenzschlüssel.
- Korrekturen einer Fahrt erfolgen durch Storno und neue eigene Erfassung. Direkte Änderungen oder Löschungen im Journal sind nicht zulässig.

Version 1 bietet keine negativen administrativen Guthabenkorrekturen, Minutenübertragungen oder Paketkorrekturen. Diese benötigen eigene Gegenbuchungsfunktionen und sind als Erweiterung vorgemerkt. Im täglichen Betrieb echte Käufe und Gutschriften vor dem Speichern prüfen; Testeinträge gehören in ein separates Projekt oder die Demo.

## Kostenübersicht

CHF-Eingaben werden exakt in ganze Rappen umgerechnet. Paketkäufe dokumentieren, wer bezahlt hat. Sie verteilen keine persönlichen Minuten automatisch und lösen keine Zahlungen aus.

Die Fahrtkosten sind **ausschliesslich eine Schätzung**. Bei Erfassung einer Fahrt bestimmt die Datenbank den gewichteten Preis sämtlicher bereits erfasster Pakete mit Kaufzeitpunkt vor oder gleich dem Fahrtzeitpunkt:

```text
Geschätzte Fahrtkosten in Rappen
  = verbrauchte Sekunden × Summe Paketpreise / Summe Paketsekunden
```

Diese Schätzung wird mit der Fahrt gespeichert und später nicht automatisch verändert. Historische Fahrten, die vor der Eingabe ihrer Paketkäufe erfasst wurden, können deshalb weiterhin offene Kosten haben. Freischaltung, sichtbarer Screenshot-Gesamtpreis und durchgestrichene Tarife werden nicht addiert. Beispiel: 600 Minuten für CHF 90.00 ergeben bei 15 Minuten Verbrauch geschätzte CHF 2.25.

Fehlen geeignete Pakete, ist die Bewertung `NULL` und wird als offen angezeigt. Sie wird nicht mit bestätigten Nullkosten verwechselt. Die Statistik nennt die Anzahl unbewerteter Fahrten neben der Summe der bekannten Schätzungen. Zwischenwerte bleiben dezimal; die Anzeige rundet auf Rappen. Da keine Ausgleichszahlungen daraus erzeugt werden, behauptet die App keine centgenaue Verteilung sämtlicher Käufe.

Es gibt keine belegte Zuordnung von Fahrten zu bestimmten Dott-Paketen und keine automatische Erfassung von Paketverfall. Der gemeinsame Bestand ist ein berechneter Stand aus euren Eingaben, kein Live-Abruf bei Dott. Falls später Verfall ergänzt wird, darf bereits erfasster Verbrauch nicht nochmals als verfallen abgezogen werden.

## Grenzen und spätere Erweiterungen

Noch nicht angelegt sind Bildspeicher, Upload-Aufträge, OCR-Ergebnisse, zusätzliche Beitragszahlungen und Paketverbrauchszuordnungen. Die SQL-Spalte `source` ist vorbereitet, erlaubt per Constraint aber zunächst ausschliesslich `manual`. Erst eine eigene Migration und geprüfte serverseitige Verarbeitung dürfen `ocr` freigeben. Deaktivierung erhält die Historie; Kontolöschung und Anonymisierung benötigen später einen separaten Ablauf.
