# Produkt und Abläufe

**Status:** Planung, noch keine implementierte App. Technischer Aufbau: [Architektur](architecture.md), Buchungen: [Datenmodell](data-model.md), Umsetzungsschritte: [Roadmap](roadmap.md). Einstieg: [README](../README.md).

## Ziel

Eine gemeinsame, auf dem iPhone zugängliche App verwaltet den persönlichen Minutenverbrauch eines geteilten Dott-Kontos. Guthaben wird in **Minuten** geführt; eine zusätzliche Kostenübersicht zeigt Paketkäufe und nachvollziehbar zugeordnete Kosten in CHF.

Oskar, August und Max sind Beispielmitglieder. Weitere Personen lassen sich ohne feste Obergrenze im Produkt hinzufügen. Namen und Mitgliederzahlen werden nicht im Programm fest eingebaut.

Jede Person lädt ihre eigenen Fahrtscreenshots hoch. Die angemeldete Person bestimmt deshalb den Fahrer; die Bilderkennung liest die Fahrtdaten. Die App muss keine Identität aus dem Screenshot erraten.

## Nutzung auf dem iPhone

Der Start erfolgt als responsive Web-App/PWA: Link öffnen, anmelden und optional zum Home-Bildschirm hinzufügen. Screenshots werden innerhalb der App aus der Fotomediathek ausgewählt. Der Upload-Dialog muss auf einem echten iPhone geprüft werden.

Eine native iOS-App mit eigener Erweiterung im Teilen-Menü ist eine spätere Option. Dieser direkte Import wird für die erste PWA-Version nicht vorausgesetzt. Neue Fahrten und Buchungen benötigen zunächst eine Internetverbindung.

## Rollen

| Rolle | Möglichkeiten |
| --- | --- |
| Mitglied | Eigene Screenshots hochladen und Erkennung bestätigen; eigene Fahrten und Buchungen ansehen; Gruppenstatistiken ansehen; Fehler zur Korrektur melden. |
| Administrator | Zusätzlich Mitglieder einladen und deaktivieren, Rollen verwalten, Pakete erfassen, beliebige gültige Minutenbeträge gutschreiben sowie Fahrten und Buchungen nachvollziehbar korrigieren. |

Jede Person erhält einen eigenen Zugang. Deaktivierte Mitglieder verlieren den Zugriff; ihre historischen Fahrten bleiben erhalten. Mitglieder sehen die Gruppenabrechnung, während rohe Screenshots nur für den jeweiligen Eigentümer und Administratoren zugänglich sind.

## Eine Fahrt erfassen

1. Die Person meldet sich an und wählt **Fahrt hinzufügen**.
2. Sie lädt einen Screenshot ihrer Fahrt hoch. Die App zeigt den Fortschritt.
3. Die Erkennung liest Fahrzeit und Pausierzeit aus den Fahrtdetails. Die App addiert beide zum Minutenverbrauch. Fahrtdatum, Uhrzeit und Fahrt-ID werden übernommen, soweit sichtbar; die Handy-Uhrzeit gilt nicht als Fahrtzeit.
4. Die App zeigt eine Vorschau mit der angemeldeten Person und den erkannten Werten. Fehlende oder widersprüchliche Angaben werden kenntlich gemacht.
5. In der ersten Version bestätigt oder korrigiert die Person die Vorschau. Erst danach entstehen Fahrt und Minutenabbuchung.
6. Guthaben, Fahrtenliste und Statistik werden aktualisiert. Die gespeicherten Werte und ihre Herkunft bleiben nachvollziehbar.

Ein OCR-Fehler oder abgebrochener Upload verbraucht keine Minuten. Ein erneut ausgelöster Vorgang erzeugt keine zweite Abbuchung. Bei einem vermuteten Duplikat zeigt die App die vorhandene Fahrt zum Vergleich und hält die neue Buchung an.

Später dürfen eindeutig erkannte Screenshots automatisch verbucht werden, sobald das betreffende Layout und die Regeln mit einem Testset geprüft sind. Unbekannte Layouts, mögliche Duplikate und unklare Werte gehen weiterhin in die Prüfung. Ein vom Modell angegebener Vertrauenswert reicht allein nicht für eine automatische Buchung.

## Minuten, Pakete und Kosten

- Administratoren können beliebige gültige positive Minutenbeträge gutschreiben; es gibt keine vorgegebenen Paketgrössen für interne Guthabenbuchungen. Jede Buchung hat eine Person, einen Betrag, einen Grund und einen Ersteller.
- Verbrauch und Korrekturen werden als eigene Buchungen erfasst. Bereits verbuchte Vorgänge werden nicht unbemerkt überschrieben. Eine Korrektur macht die ursprüngliche Wirkung nachvollziehbar rückgängig und erfasst den richtigen Wert.
- Persönliches Guthaben, gekauftes Gruppenpaket und gegebenenfalls in Dott angezeigter Restbestand sind getrennte Grössen. Eine interne Gutschrift kauft keine Minuten bei Dott.
- Ein zu kleiner Saldo verhindert das Erfassen einer tatsächlich gefahrenen Fahrt nicht. Der negative Saldo bleibt sichtbar und kann ausgeglichen werden.
- Paketkäufe enthalten mindestens Minutenmenge, Preis in CHF, Kaufdatum und zahlende Person. Ein Ablaufdatum wird erfasst, wenn es bekannt und relevant ist.
- Die Kostenübersicht zeigt Paketkäufe und Zahlungen getrennt vom errechneten Verbrauchswert. Ohne belastbare Bewertungsgrundlage erscheint «noch nicht zugeordnet». Schätzungen benötigen eine ausdrücklich gespeicherte Annahme und sichtbare Kennzeichnung; bestätigte Kosten beruhen auf einer belegten Paketzuordnung und bekanntem Preis. Diese Zustände werden getrennt ausgewiesen.
- Fahrzeit, Pausierzeit und Minutenverbrauch bleiben getrennte Felder. Für eure Gruppe gilt ausdrücklich **Verbrauch = Fahrzeit + Pausierzeit**: 14 Minuten Fahrt und 1 Minute Pause belasten 15 Minuten. Sekunden werden erhalten; zusätzliche Rundungsregeln werden nicht erfunden.
- Die Freischaltgebühr wird auf Wunsch der Gruppe vollständig aus der internen Abrechnung ausgeschlossen. Auch der angezeigte Gesamtpreis und durchgestrichene Preise werden nicht als persönliche Fahrtkosten übernommen. Die CHF-Übersicht basiert auf Paketpreisen und verbrauchten Minuten.

## Seiten der App

| Seite | Inhalt |
| --- | --- |
| Übersicht | Eigenes Minutenguthaben, kürzliche Fahrten, offene Prüfungen, schneller Screenshot-Upload. |
| Fahrt hinzufügen | Fotoauswahl, Erkennungsstatus, Vorschau, Korrektur und Bestätigung. |
| Fahrten | Filter nach Zeitraum und Person; Detailansicht mit Fahrzeit, Pausierzeit, Verbrauch, Kostenstatus und Buchungsbezug. |
| Guthaben und Pakete | Persönliches Buchungsjournal, Gruppenpakete und CHF-Übersicht; administrative Gutschriften und Korrekturen. |
| Statistik | Fahrtenzahl, Fahrzeit, Pausierzeit, verbrauchte Minuten und Durchschnitt pro Fahrt; Vergleich nach Person und Zeitraum. |
| Mitglieder | Einladungen, Rollen und Aktivstatus; keine Beschränkung auf die drei Beispielpersonen. |

Statistiken verwenden nur bestätigte beziehungsweise regelbasiert automatisch verbuchte Fahrten. Offene Prüfungen werden separat gezählt. Stornierte oder korrigierte Vorgänge dürfen den Verbrauch nicht doppelt erhöhen. Zeiträume werden in `Europe/Zurich` angezeigt und abgegrenzt.

## Sinnvolle Erweiterungen

1. **Guthaben- und Ablaufhinweise:** Wenig eigene Minuten und bevorstehender Paketverfall sind direkt in der App sichtbar.
2. **Monatsabschluss:** Kompakte Übersicht über Verbrauch, Zahlungen und offene Zuordnungen; Export als CSV.
3. **Mehrere Screenshots auf einmal:** Jede Fahrt erhält eine eigene Vorschau; identische Importe bleiben ausgeschlossen.
4. **Bestandsabgleich:** Manuell erfassten Dott-Restbestand mit dem internen Gruppenbestand vergleichen und Abweichungen untersuchen.
5. **Ausgleichsvorschlag:** Nach Festlegung einer gemeinsamen Kostenregel anzeigen, wer wem wie viel schuldet. Zahlungen werden zunächst nur dokumentiert.

## Vor der Umsetzung anhand von Belegen festzulegen

- Wie sehen weitere Screenshotvarianten aus, insbesondere ohne Pause oder mit Sekundenangaben? Das bereits bekannte Layout ist in der [Screenshot-Erkennung](screenshot-recognition.md) beschrieben.
- Welche Rundung gilt gegebenenfalls bei Sekundenangaben? Die Addition der Fahr- und Pausierzeit sowie das Ignorieren der Freischaltgebühr sind bereits festgelegt.
- Wie werden Fahrten mehreren gleichzeitig aktiven Paketen zugeordnet und nicht verbrauchte Minuten behandelt?

Diese Punkte blockieren die Planung nicht, müssen aber geklärt sein, bevor die App Minuten oder CHF-Werte nach solchen Regeln automatisch verbucht.
