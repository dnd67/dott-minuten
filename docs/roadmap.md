# Roadmap und Abnahme

**Status:** Umsetzungsplan. Die folgenden Funktionen und Prüfungen sind noch nicht implementiert oder durchgeführt. Anforderungen: [Produkt](product.md), Technik: [Architektur](architecture.md), Buchungen: [Datenmodell](data-model.md), Einstieg: [README](../README.md).

## 1. Belege und Abrechnungsregeln prüfen

Ein Testset aus echten, anonymisierten Fahrtscreenshots erstellen. Originale mit personenbezogenen Angaben gehören nicht in das öffentliche Repository. Das Testset soll die tatsächlich vorkommenden Sprachen und Layouts sowie mindestens folgende Fälle enthalten: normale Fahrt, Sekundenangaben, fehlendes Feld, schlechter Zuschnitt, identische Datei, veränderte Kopie derselben Fahrt und zwei verschiedene Fahrten mit ähnlichen Werten.

Für jedes Beispiel werden erwartete Werte und zulässige Ergebnisse manuell festgehalten. Ein zurückgehaltener Teil dient der unabhängigen Prüfung der Erkennung. Fahrtdauer, Paketverbrauch und CHF-Kosten werden getrennt annotiert. Dott-Rundungsregeln werden nur übernommen, wenn sie aus Belegen oder verlässlichen Produktangaben hervorgehen.

**Abnahme:** Die unterstützten Layouts, benötigten Felder und Abrechnungsregeln sind dokumentiert. Für unklare oder unbekannte Angaben ist festgelegt, wann eine manuelle Prüfung nötig ist. Es existieren keine stillen Annahmen über Minutenrundung oder Gebühren.

## 2. Gemeinsame Konten und manuelle Buchungen

Anmeldung, Gruppe, Mitgliedereinladungen, Rollen, Minutenjournal, Paketkäufe und CHF-Übersicht umsetzen. Zuerst muss eine Fahrt auch ohne OCR manuell erfasst werden können. Beispieldaten nutzen Oskar, August und Max, ohne diese Namen in der Geschäftslogik fest einzubauen.

**Abnahme:**

- Ein viertes und weitere Mitglieder lassen sich über denselben Ablauf hinzufügen; die Mitgliederliste hat keine feste Produktobergrenze.
- Administratoren können frei eingegebene gültige Minutenbeträge gutschreiben. Ungültige Eingaben werden abgewiesen.
- Guthaben entspricht der Summe seiner Buchungen; eine Korrektur lässt den ursprünglichen Vorgang nachvollziehbar.
- Negative Salden bleiben sichtbar, ohne tatsächliche Fahrten zu verwerfen.
- Ein Mitglied kann keine fremden Guthaben verändern. Zugriffsgrenzen werden serverseitig geprüft, einschliesslich direkter API-Aufrufe.
- Gleichzeitige Buchungen verlieren keine Änderungen. Fahrt und zugehörige Abbuchung werden gemeinsam oder gar nicht gespeichert.

## 3. Screenshot-Upload mit bestätigter Erkennung

Privaten Bildspeicher, Upload-Verarbeitung und OCR/Bilderkennung integrieren. Die angemeldete Person wird als Fahrer übernommen. Die erkannten Zeiten erscheinen automatisch in einer editierbaren Vorschau; am Anfang wird jede Fahrt bestätigt.

Duplikate zuerst anhand einer sichtbaren Fahrt-ID prüfen, soweit vorhanden. Zusätzlich identische Dateien erkennen und ähnliche Fahrtdaten vergleichen. Ein identischer Import darf keine zweite Fahrt erzeugen; ein Ähnlichkeitshinweis darf unterschiedliche Fahrten nicht endgültig verwerfen.

**Abnahme:**

- Die Erkennung wird gegen die annotierten Screenshots geprüft; Ergebnisse und bekannte Grenzen sind dokumentiert.
- Fehlende, widersprüchliche oder ungültige Pflichtwerte führen zur Prüfung statt zu einer Abbuchung.
- Doppelklick auf «Bestätigen», Wiederholung nach Netzunterbruch und erneute Verarbeitung desselben Auftrags erzeugen jeweils genau eine Fahrt mit genau einer Abbuchung.
- Ein Timeout zeigt einen wiederaufnehmbaren Status. Ein fehlgeschlagener oder abgebrochener Upload verändert kein Guthaben.
- Duplikatfälle und zwei ähnliche, aber verschiedene Fahrten werden mit gezielten Beispielen geprüft.
- Nicht berechtigte Personen können gespeicherte Screenshotdateien nicht abrufen.

## 4. Statistik und iPhone-Pilot

Übersicht, Fahrtenfilter, Personenvergleich und Kostenanzeige fertigstellen. Oskar, August und Max testen den vollständigen Ablauf mit wenigen realen Fahrten. Verglichen werden die Screenshots, die angezeigten Buchungen und eine unabhängig berechnete Abrechnung.

**Abnahme:**

- Fotoauswahl, Upload, Vorschau, Korrektur und Bestätigung funktionieren in Safari auf einem echten iPhone und nach Hinzufügen zum Home-Bildschirm.
- Kleine Displays zeigen keine abgeschnittenen wichtigen Bedienelemente; Formulare bleiben bei geöffneter Tastatur bedienbar.
- Fahrtenzahl, Dauer und Minutenverbrauch stimmen mit den bestätigten Fahrten überein. Korrekturen und offene Prüfungen verfälschen die Statistik nicht.
- Tages- und Monatsgrenzen werden in `Europe/Zurich` geprüft, einschliesslich Zeitumstellung.
- CHF-Werte sind nachvollziehbar aus Paketen abgeleitet; unbekannte, ausdrücklich geschätzte und bestätigte Kosten werden getrennt ausgewiesen.
- Paketverfall berücksichtigt bereits gebuchten, noch nicht zugeordneten Verbrauch. Endgültiger Verfall wird erst nach dessen Klärung verbucht und zieht keine Minuten doppelt ab.
- Datenbanksicherung und Wiederherstellung wurden vor dem dauerhaften Einsatz geprüft.

## 5. Gezielte Automatik und Komfort

Automatische Verbuchung pro geprüftem Screenshotlayout freischalten. Die Freigabe ist an die dokumentierten Layout- und Plausibilitätsregeln gebunden. Ein unbekanntes oder geändertes Layout fällt auf die Bestätigung zurück. Administratoren können die Automatik abschalten.

**Abnahme:** Auf dem zurückgehaltenen Testset entsprechen alle automatisch verbuchten Fälle den manuell geprüften Pflichtwerten; unklare Fälle verbleiben in der Prüfung. Die bestandenen Beispiele belegen nur die getesteten Layouts, keine allgemeine Fehlerfreiheit. Duplikatprüfung und Idempotenz gelten auch bei automatischer Verarbeitung.

Danach nach Nutzen priorisieren: Guthabenhinweise, Paketablauf, CSV-Export, Monatsabschluss, Mehrfachupload und Bestandsabgleich. Eine native iOS-App mit Teilen-Erweiterung bleibt ein eigener späterer Entscheid.
