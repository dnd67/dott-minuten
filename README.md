# Dott Minuten

Eine geplante iPhone-taugliche Web-App zur gemeinsamen Verwaltung von E-Scooter-Minutenpaketen: Jede Person lädt ihren Fahrt-Screenshot hoch, die App erkennt die Zeit und ordnet die Fahrt dem persönlichen Zugang zu. Ein Minutenkonto und eine Kostenübersicht machen den Verbrauch nachvollziehbar.

**Status: Infrastruktur- und Produktplanung. Es gibt noch keine ausführbare App und kein Deployment.** Dieses Repository ist die Grundlage für die anschliessende Umsetzung. Es handelt sich um ein unabhängiges Projekt ohne offizielle Verbindung zu Dott.

## Festgelegter Umfang

- Persönliches Guthaben in **Minuten**, ergänzt um eine **Kostenübersicht in CHF**.
- Jede Person lädt ihre eigenen Screenshots hoch. Die Zuordnung erfolgt über ihren eigenen Login.
- Die App liest die Zeit direkt aus dem Bild; bei unklarer Erkennung ist eine Korrektur möglich.
- Die Gruppe startet beispielsweise mit Oskar, August und Max. Weitere Mitglieder können eingeladen werden; die Anzahl ist nicht auf drei festgelegt.
- Admins können frei wählbare Minutenbeträge gutschreiben und nachvollziehbar korrigieren.
- Alle Mitglieder sehen ihren Verbrauch sowie die gemeinsame Statistik und Buchungshistorie.

## So funktioniert eine Fahrt

1. Die Web-App auf dem iPhone öffnen und mit dem persönlichen Zugang anmelden.
2. Nach der Fahrt einen Screenshot aus der Fotomediathek auswählen.
3. Die App liest Fahrtdauer, Datum und, soweit sichtbar, abgezogene Paketminuten und Zusatzkosten.
4. Die Vorschau zeigt Person und erkannte Werte. In der ersten Version bestätigt die Person die Buchung mit einem Tippen.
5. Minutenkonto, Fahrtenliste und Statistik werden gemeinsam aktualisiert.

Nach Prüfung echter Screenshotvarianten kann für eindeutig erkannte Fälle die automatische Buchung aktiviert werden. Unleserliche Bilder und mögliche Duplikate bleiben zur Prüfung offen. Die App errät keine fehlenden Werte.

## Empfohlene Infrastruktur

| Baustein | Vorschlag | Zweck |
| --- | --- | --- |
| Oberfläche | Next.js mit TypeScript als PWA | Gemeinsamer Link, Safari und Installation auf dem Home-Bildschirm |
| Web-Hosting | Vercel | HTTPS, Vorschau-Deployments und Betrieb der Oberfläche |
| Anmeldung | Supabase Auth mit E-Mail-Code | Persönlicher Zugang ohne gemeinsame App-Zugangsdaten |
| Datenbank | Supabase PostgreSQL | Gruppen, Fahrten, Pakete und Buchungsjournal |
| Bildspeicher | Privater Supabase Storage | Zugriff auf Screenshots nur für berechtigte Personen |
| Verarbeitung | Datenbank-Auftragsliste und serverseitiger Worker | Erkennung, Wiederholungen und Schutz vor doppelter Buchung |
| Bilderkennung | Serverseitige Vision/OCR-API, zunächst OpenAI als Kandidat | Strukturierte Extraktion aus Screenshots |

Die konkrete OCR-Modellwahl erfolgt nach einem Test mit anonymisierten Dott-Screenshots. Es wird keine direkte Dott-API vorausgesetzt. Paketkäufe und Bestandsabgleiche werden zunächst manuell erfasst.

## Dokumentation

- [Produkt, Ansichten und Rollen](docs/product.md)
- [Architektur, Infrastruktur und Betrieb](docs/architecture.md)
- [Datenmodell und Abrechnung](docs/data-model.md)
- [Screenshot-Erkennung und automatische Buchung](docs/screenshot-recognition.md)
- [Umsetzungsplan und Abnahmekriterien](docs/roadmap.md)

## Nützliche Erweiterungen

- Warnungen bei knappem Guthaben und bald ablaufenden Paketen.
- Übersicht, wer Pakete bezahlt hat und wer wie viele Minuten verbraucht hat.
- CSV-Export und ein monatlicher Abschluss.
- Nachvollziehbare Minutenübertragungen zwischen Mitgliedern.
- Erinnerung an fehlende Fahrten, wenn der berechnete Bestand vom Dott-Bestand abweicht.
- Später ein nativer iOS-Teilen-Eintrag für Screenshots, falls der Upload in der Web-App nicht genügt.

## Nächster Umsetzungsschritt

Mit einigen anonymisierten Screenshotvarianten die erkennbaren Felder und den Unterschied zwischen Fahrtdauer und belasteten Paketminuten prüfen. Parallel können Login, Gruppenverwaltung, Minutenjournal und die mobile Oberfläche umgesetzt werden.

Dieses öffentliche Repository enthält ausschliesslich Planung. Echte Fahrtbilder, Einladungen, Zugangsdaten und Datenbankexporte gehören in private Systeme.
