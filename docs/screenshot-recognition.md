# Screenshot-Erkennung

[Zur Übersicht](../README.md)

## Automatische Personenzuordnung

Jede Person lädt ihre eigene Fahrt hoch. Die App setzt deshalb die aktive Mitgliedschaft des angemeldeten Nutzers als fahrende Person. Der Nutzer kann die Zuordnung in der Vorschau sehen; eine fehlerhafte verbuchte Zuordnung wird über einen nachvollziehbaren Korrekturprozess geändert.

Ein Screenshot eines gemeinsam verwendeten Dott-Kontos kann die fahrende Person normalerweise nicht zuverlässig beweisen. Das Bildmodell soll deshalb keine Namen raten. Die serverseitige Personenzuordnung erfolgt unabhängig von der Bilderkennung.

## Zu erkennende Informationen

| Feld | Verwendung |
| --- | --- |
| Fahrtdauer | Statistik und sichtbare Vorschau, intern in Sekunden |
| Belastete Paketzeit | Minutenabzug, sofern eindeutig separat sichtbar |
| Datum und Uhrzeit | Fahrtenliste, Zeitraumfilter und Duplikatprüfung |
| Fahrt-ID | Erkennen bereits erfasster Fahrten, sofern sichtbar |
| Einzelne Zusatzgebühren | Separate Kostenübersicht, sofern beschriftet |
| Angezeigter Rechnungsbetrag | Beleginformation mit klarer Kennzeichnung; keine automatische Doppelzählung |

Fehlende Felder werden als `null` ausgegeben. Dauer und belastete Zeit werden nicht miteinander vertauscht. Werte wie «12:30» müssen anhand der Beschriftung als Uhrzeit oder Dauer erkannt werden; das Format allein genügt nicht.

## Extraktionsvertrag

Der Worker erwartet strukturiertes JSON mit fester Schemaversion. Ein möglicher Vertrag ist:

```json
{
  "schema_version": 1,
  "document_type": "ride_receipt",
  "ride_reference": null,
  "ride_date_local": null,
  "ride_time_local": null,
  "duration_seconds": 700,
  "charged_seconds": null,
  "extra_fee_rappen": null,
  "displayed_total_rappen": null,
  "currency": null,
  "evidence": {
    "duration": "Fahrtdauer: 11 Min. 40 Sek."
  },
  "review_reasons": ["charged_duration_missing"]
}
```

Das Beispiel ist synthetisch. Sichtbare Belegtexte werden auf die benötigten Felder begrenzt. Schema- und Werteprüfung erfolgen im Servercode; ein formal gültiges Modellresultat ist noch keine fachlich gültige Buchung.

Bildinhalte sind nicht vertrauenswürdige Eingaben. Darin enthaltene Anweisungen werden als Bildtext behandelt und können weder Tools aufrufen noch Identitäten, Buchungsregeln oder Berechtigungen verändern.

## Zustände und Fehlerbehandlung

```mermaid
stateDiagram-v2
    [*] --> uploaded
    uploaded --> processing
    processing --> needs_review
    processing --> retry_pending
    retry_pending --> processing
    retry_pending --> failed
    needs_review --> booked: Bestätigung und Transaktion
    needs_review --> rejected
    processing --> booked: Später nur bei erfüllten Automatikregeln
    failed --> processing: Erneuter Versuch
```

Vorübergehende Anbieterfehler werden mit begrenzter Versuchszahl und zunehmender Wartezeit wiederholt. Dauerhafte Fehler erscheinen mit verständlichem Hinweis. Ein nicht lesbares Bild kann ersetzt oder durch einen als manuell erfasst gekennzeichneten Entwurf ergänzt werden. Ein OCR-Fehler allein verändert kein Guthaben.

## Einführung der Automatik

**Erste Version:** Die Zeit wird automatisch erkannt und vorausgefüllt. Die Person prüft die Vorschau und bestätigt mit einem Tippen. Fehlende Abrechnungsinformationen werden sichtbar ergänzt oder anhand einer bereits geprüften Gruppenregel bestimmt.

**Spätere automatische Buchung:** Aktivierbar für bereits getestete Screenshotvarianten, wenn alle notwendigen Felder vorhanden sind, Format und Werteprüfung bestehen, die Abrechnungsregel geklärt ist und kein Duplikatverdacht vorliegt. Jede automatische Buchung bleibt in der Historie erkennbar und korrigierbar.

Eine vom Bildmodell selbst genannte Prozentzahl genügt nicht als Freigabe. Die Regeln beruhen auf gemessenen Ergebnissen und überprüfbaren Feldern.

## Duplikate

1. Externe Fahrt-ID innerhalb der Gruppe vergleichen, falls vorhanden.
2. Dateiprüfsumme vergleichen, um ein identisches Bild zu erkennen.
3. Datum, Zeit, Dauer und Belastung auf verdächtige Übereinstimmung prüfen.
4. Bei zugeschnittenen oder anders komprimierten Bildern ohne eindeutige ID eine Prüfung verlangen, statt blind zu buchen oder eine andere Fahrt zu verwerfen.

Die Prüfung gilt gruppenweit, damit zwei Mitglieder dasselbe Bild nicht unabhängig belasten. Auftragswiederholungen und doppelte Klicks werden zusätzlich über Datenbank-Idempotenz abgesichert.

## Validierung vor Nutzung

Ein kleiner, bewusst variierter Satz anonymisierter Screenshots sollte unter anderem Folgendes abdecken:

- Unterschiedliche Layouts, Spracheinstellungen und Hell-/Dunkeldarstellung, soweit tatsächlich verwendet.
- Sekundenangaben, längere Fahrten und separat ausgewiesene Paketbelastung.
- Zusatzkosten, fehlende Felder, unscharfe oder zugeschnittene Bilder.
- Dasselbe Bild zweimal und dieselbe Fahrt in verschiedenen Bildausschnitten.
- Eine andere Bildschirmansicht, die gar keine abgeschlossene Fahrt zeigt.
- Unvollständige Datumsangaben und Uhrzeiten rund um einen Tageswechsel.

Für jedes Bild werden erwartete Felder manuell festgelegt. Gemessen werden korrekte Dauer, korrekte Belastung, angemessene Rückfragen und fälschlich freigegebene Buchungen. Automatik wird je unterstütztem Layout erst nach bestandener Prüfung aktiviert; unbekannte Varianten gehen zurück in die Vorschau.

Echte Fahrtbilder bleiben ausserhalb dieses öffentlichen Repositories. Öffentlich eincheckbar sind synthetische Beispiele oder ausdrücklich für die Veröffentlichung freigegebene, sorgfältig anonymisierte Testbilder.
