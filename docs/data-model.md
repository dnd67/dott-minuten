# Datenmodell und Abrechnung

[Zur Übersicht](../README.md)

## Grundregeln

Das persönliche Guthaben wird in Minuten angezeigt. Intern werden Zeitwerte als ganze Sekunden geführt, Geldwerte als ganze Rappen. Dadurch entstehen keine Rundungsfehler durch binäre Gleitkommazahlen. Eingaben mit Minutenbruchteilen werden nach einer klaren, dokumentierten Eingaberegel in Sekunden umgerechnet; die App akzeptiert keine versteckte Rundung.

**Fahrzeit, Pausierzeit und belastete Paketminuten sind getrennte Werte.** Für diese Gruppe wurde bestätigt: `charged_seconds = duration_seconds + pause_seconds`. Beispiel: 14 Minuten Fahrzeit plus 1 Minute Pause ergeben 900 Sekunden beziehungsweise 15 Minuten Verbrauch. Die Regel wird serverseitig angewendet und mit ihrer Version an der Buchung festgehalten. Die App erfindet keine zusätzliche Dott-Rundungsregel.

Die Freischaltgebühr wird für diese Gruppe ignoriert. Durchgestrichene Preise und der angezeigte Gesamtbetrag dienen nicht als Grundlage der internen Kostenberechnung. Diese basiert auf Paketpreis und verbrauchten Minuten.

Persönliche Gutschriften, tatsächliche Paketkäufe und CHF-Zahlungen bleiben getrennt. Eine interne Gutschrift kauft keine Minuten bei Dott. CHF-Einzahlungen werden nicht ohne eine gewählte Umrechnungsregel in Minuten umgewandelt.

## Entitäten

Die Tabelle ist ein fachlicher Schemaentwurf, noch keine ausführbare SQL-Migration. Sämtliche gruppenbezogenen Beziehungen müssen auf dieselbe Gruppe zeigen; Fremdschlüssel und zusammengesetzte Constraints sichern dies zusätzlich zur Zugriffskontrolle ab.

| Tabelle | Wesentliche Inhalte |
| --- | --- |
| `groups` | Name, Währung CHF, Anzeigezeitzone `Europe/Zurich`, Einstellungen |
| `memberships` | Gruppe, Auth-Nutzer, Anzeigename, Rolle, Aktivstatus; eindeutig pro Gruppe/Nutzer |
| `invitations` | Gruppe, vorgesehene Rolle, gehashter Token, Ablaufdatum, Einlösezeitpunkt |
| `packages` | Gekaufte Sekunden, Preis in Rappen, Kaufdatum, optional Ablaufdatum, kaufende Person |
| `uploads` | Hochladende Mitgliedschaft, privater Speicherpfad, SHA-256, Status, Erkennerversion, Löschfrist |
| `processing_jobs` | Upload, Versuchszahl, Status, frühester nächster Versuch, Reservierung und deren Ablauf |
| `extractions` | Strukturierte erkannte Felder, sichtbare Belegtexte, Prüfhinweise, Schema-/Modellversion |
| `rides` | Fahrende Person, hochladende Person, Fahrtzeitpunkt, `duration_seconds` (Fahrzeit), `pause_seconds` (Pausierzeit), `charged_seconds` (Summe), Abrechnungsregelversion, optionale externe Fahrt-ID, Status, Version sowie Kostenstatus `unknown`/`estimated`/`confirmed` mit Bewertungsgrundlage |
| `minute_entries` | Mitgliedschaft, vorzeichenbehaftete Sekunden, Art, Fahrtbezug, ausführende Person, Grund, Gegenbuchungsbezug |
| `inventory_entries` | Veränderung des gemeinsamen Paketbestands, Sekunden, optional Paket- und Fahrtbezug, Art, Grund und Gegenbuchungsbezug |
| `ride_package_usage` | Zuordnung einer Fahrt zu einem oder mehreren Paketen mit jeweils verbrauchten Sekunden, Kostenbewertung und Herkunft der Zuordnung (belegt oder explizite Annahme) |
| `payments` | Zahlende Person, Betrag in Rappen, Datum, Zweck und optional Paketbezug; erfasste Zahlungen ohne Zahlungsabwicklung |
| `audit_events` | Nachvollziehbare Mitglieds-, Rollen- und Freigabeänderungen mit Akteur und Zeitpunkt |

## Persönliches Minutenjournal

```text
Persönliches Guthaben = Summe aller wirksamen minute_entries der Person
```

- Gutschrift: positiver Betrag, nur durch Admins.
- Verbrauch: negativer Betrag aus einer bestätigten Fahrt.
- Übertragung: negativer und positiver Betrag für zwei Mitglieder in derselben Transaktion.
- Korrektur: Gegenbuchung zur alten Buchung und, falls nötig, neue Buchung mit Grund.

Es gibt keine fest vorgegebenen Aufladebeträge. Jede fachlich gültige Eingabe innerhalb der technischen Zahlenbereiche ist möglich. Änderungen werden nicht durch ein stilles Überschreiben des Saldos umgesetzt.

Negative persönliche Salden bleiben sichtbar und lösen einen Hinweis aus. Eine tatsächlich gefahrene und bestätigte Fahrt darf nicht verschwinden, nur weil vorher zu wenig internes Guthaben vorhanden war.

## Gemeinsamer Bestand

```text
Berechneter Paketbestand
  = erfasste Käufe + Bestandskorrekturen - Verbrauch - Verfall

Rechnerisch nicht zugewiesene Minuten
  = berechneter Paketbestand - Summe der persönlichen Guthaben
```

Die App zeigt den berechneten Bestand und das Datum des letzten manuellen Abgleichs mit Dott. Ohne direkte Anbieter-Anbindung kann sie ausgelassene Fahrten oder nicht erfasste Käufe nicht selbst feststellen.

Admins können auch grössere freie Gutschriften erfassen. Übersteigt die Summe der Guthaben den erfassten Bestand, zeigt die App eine Unterdeckung. Sie erzeugt dafür keinen fiktiven Paketkauf.

Verfall reduziert den gemeinsamen Bestand. Eine allfällige Aufteilung des Verlusts auf persönliche Guthaben wird als separate, begründete Buchung behandelt. Solange dafür keine Gruppenregel vereinbart ist, erscheint der Unterschied sichtbar zur Klärung; persönliche Guthaben werden nicht heimlich gekürzt.

Unbekannte Paketzuordnung verhindert nicht die Erfassung eines bestätigten Verbrauchs: Ein gruppenweiter Bestandsabzug kann zunächst ohne Paketbezug erfolgen. Seine spätere Zuordnung ergänzt die Kostenbewertung und darf keinen zweiten Bestandsabzug erzeugen.

Vor einer endgültigen Verfallsbuchung muss noch nicht zugeordneter Verbrauch für die betroffenen Pakete geklärt werden. Andernfalls bleiben Verfall und Paketrest ausdrücklich vorläufig. Beispiel: Nach dem Kauf von 600 Minuten und 10 bereits gruppenweit abgezogenen Minuten dürfen nicht zusätzlich alle 600 Minuten als verfallen abgebucht werden. Verfallen kann nur der tatsächlich unverbrauchte Rest.

## Kostenübersicht

Zu unterscheiden sind:

1. **Paketkäufe:** Was die Gruppe für Minuten bezahlt hat.
2. **Beiträge/Zahlungen:** Wer tatsächlich welchen Betrag beigetragen hat.
3. **Verbrauchskosten:** Welcher Anteil der Paketkosten auf die Fahrten einer Person entfällt.

Beispiel mit frei erfundenem Paketpreis: Ein Paket mit 600 Minuten kostet CHF 90.00. Bei 14 Minuten Fahrzeit und 1 Minute Pause entstehen 15 Minuten Verbrauch und damit CHF 2.25 anteilige Paketkosten. Eine im Screenshot angezeigte Freischaltgebühr wird nicht addiert. Fehlen Pausenangaben, wird deren Wert nicht stillschweigend als null angenommen; die Vorschau verlangt eine Klärung.

Bei mehreren Paketen wird der Verbrauch einem Paket oder mehreren Paketen zugeordnet. Die tatsächliche Zuordnung wird, soweit verfügbar, übernommen. Eine angenommene Reihenfolge wie «zuerst ablaufendes Paket zuerst» darf erst nach Prüfung als Regel verwendet werden und wird andernfalls als Schätzung gekennzeichnet.

Kosten werden aus Paketpreis und zugeordnetem Verbrauch berechnet. Zwischenrechnungen behalten die erforderliche Dezimalpräzision; die Anzeige wird auf Rappen gerundet. Für spätere Ausgleichszahlungen braucht es eine dokumentierte Restbetragsregel, damit gerundete Teilbeträge wieder die Gesamtsumme ergeben.

Ohne belastbare Bewertungsgrundlage sind Kosten **unbekannt**, niemals stillschweigend CHF 0.00. **Geschätzte** Kosten sind nur mit einer ausdrücklich gespeicherten Annahme und sichtbarer Kennzeichnung zulässig; sie zählen nicht als endgültig abgerechnete Kosten. **Bestätigte** Kosten beruhen auf einer belegten Zuordnung und bekanntem Preis. Die Statistik weist die drei Zustände getrennt aus. Der sichtbare Gesamtrechnungsbetrag wird nicht als interne Fahrtkosten übernommen oder zu Paketkosten addiert. Eine verbindliche «wer schuldet wem»-Abrechnung ist eine spätere Funktion mit eigener Verteilregel.

## Zeit, Duplikate und Buchungssicherheit

- Zeitpunkte werden intern in UTC gespeichert und in `Europe/Zurich` angezeigt. Sommer-/Winterzeit und unvollständige Datumsangaben werden ausdrücklich behandelt.
- Anzeigenamen sind keine Schlüssel. Eine Umbenennung von Oskar oder das Hinzufügen einer weiteren Person namens Max verändert keine früheren Zuordnungen.
- Mitglieder werden deaktiviert statt mitsamt ihrer Buchungen gelöscht. Eine Kontolöschung benötigt eine gesonderte Anonymisierungs- und Aufbewahrungsregel.
- Eindeutige externe Fahrt-IDs gelten innerhalb einer Gruppe. Fehlende IDs bleiben `NULL` und werden nicht künstlich erzeugt.
- Identische Bildprüfsummen und ähnliche Fahrtdaten führen zu Duplikatprüfungen; OCR-Texte allein sind kein sicherer Schlüssel.
- Fahrtversion und Buchungs-Idempotenzschlüssel sind eindeutig. Zustandswechsel und Journalbuchungen erfolgen gemeinsam in einer Datenbanktransaktion.
- Korrekturen einer verbuchten Fahrt erzeugen eine neue Version, Gegenbuchungen und aktualisierte Kostenbezüge. Vergangene Buchungen bleiben nachvollziehbar.

## Datenschutz im Modell

Keine Dott-Zugangsdaten speichern. Bewegungsrouten, Start-/Zieladressen und andere für Minuten und Kosten unnötige Bildinhalte werden nicht als strukturierte Daten übernommen. Das Originalbild erhält eine begrenzte Aufbewahrung. Statistik und Buchungsjournal müssen auch nach dessen Löschung verständlich bleiben.
