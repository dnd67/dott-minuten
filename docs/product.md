# Produkt und Abläufe

[Zur Übersicht](../README.md) · [Einrichtung](setup.md) · [Technik](architecture.md)

## Erste Version

Eine gemeinsame Web-App verwaltet eure Scooter-Minuten. Persönliches Guthaben wird in Minuten geführt. Eine zusätzliche CHF-Übersicht zeigt Paketkäufe und ausdrücklich geschätzte Verbrauchswerte.

Jede Person hat einen eigenen Login und trägt ihre Fahrzeit und Pausierzeit **manuell** ein. Oskar, August und Max sind ausschliesslich Demo-Mitglieder. Im echten Betrieb erstellt ihr eure eigenen Konten und ladet weitere Personen ein; keine Mitgliederzahl ist fest eingebaut.

## Rollen

| Rolle    | Möglichkeiten                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mitglied | Eigenen Anzeigenamen ändern; eigene Fahrten erfassen; Gruppenfahrten, Guthaben, Journal, Pakete und Statistiken ansehen.                                                 |
| Admin    | Zusätzlich alle Mitgliedsnamen ändern, Mitglieder einladen, aktivieren/deaktivieren und Rollen verwalten, Guthaben gutschreiben, Pakete erfassen und Fahrten stornieren. |

Neue Mitglieder starten bei 0 Minuten. Mindestens ein aktiver Admin bleibt erhalten. Deaktivierte Personen verlieren den Zugriff, bleiben aber in der Historie sichtbar. Jede Gruppe ist gegenüber fremden Logins abgeschirmt.

## Eine Fahrt erfassen

1. Mit der eigenen E-Mail-Adresse anmelden.
2. **Fahrt eintragen** wählen.
3. Ganze Fahrminuten und Pausenminuten, Fahrtzeitpunkt und optional eine Notiz eingeben.
4. Die Vorschau zeigt die Summe; **Speichern** verbucht Fahrt und Minutenabzug gemeinsam.
5. Guthaben, Fahrtenliste und Statistik werden auf den verbundenen Geräten aktualisiert.

**14 Minuten Fahrt + 1 Minute Pause belasten 15 Minuten.** Freischaltgebühren werden ignoriert. Ein Fehler oder ein nicht bestätigter Speichervorgang darf keine unbemerkte Doppelbuchung erzeugen. Bei unklarem Ausgang nach vollständigem Neuladen zuerst die Fahrtenliste kontrollieren; inhaltlich gleiche manuelle Fahrten werden noch nicht automatisch als Duplikate erkannt.

Unter **Mitglieder → Name ändern** können Mitglieder ihren eigenen und Admins den Anzeigenamen jeder Person ändern. Die Mitglieds-ID und damit alle Guthaben-/Fahrtzuordnungen bleiben erhalten.

Ein Admin storniert fehlerhafte Fahrten mit Grund. Unter **Fahrten → Status → Storno-Verlauf** stehen ursprüngliche Fahrminuten, Grund, Stornozeitpunkt, ausführende Person und zurückgebuchte Minuten. Zeitraumfilter beziehen sich dort auf das Stornodatum; die Anzeige ist nach neuestem Storno sortiert. Eine Gegenbuchung gibt die Minuten zurück. Die richtige Fahrt wird danach neu erfasst. Negative Salden sind sichtbar, blockieren aber keine tatsächlich gefahrene Fahrt.

## Seiten

| Seite      | Inhalt                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Übersicht  | Eigenes Guthaben, Monatsverbrauch, gemeinsamer Paketbestand, Verlauf der letzten 14 Tage, Crew-Vergleich und letzte Fahrten. |
| Fahrten    | Filter nach Person und Zeitraum, getrennte Fahr-/Pausenzeiten, Verbrauch, geschätzte Kosten und gegebenenfalls Storno.       |
| Guthaben   | Persönliche Salden, nicht zugewiesene Minuten, Paketkäufe und Journal; Admin-Formulare für Gutschriften und Käufe.           |
| Statistik  | Fahrtenzahl, Verbrauch, Durchschnitt, Personenvergleich sowie geschätzter Verbrauchswert und offene Kostenbewertungen.       |
| Mitglieder | Mitgliederliste, Rollen, Aktivstatus und zeitlich begrenzte Einladungen.                                                     |

Paketkäufe und interne Gutschriften bleiben getrennte Aktionen. Die CHF-Verbrauchswerte beruhen auf einem gespeicherten gewichteten Paketpreis, sind sichtbar geschätzt und stellen keine Schuldenabrechnung dar. Details: [Datenmodell](data-model.md).

## iPhone und Synchronisierung

Die App ist per HTTPS-Link und über **Safari → Teilen → Zum Home-Bildschirm** zugänglich. Geöffnete Apps erhalten Realtime-Hinweise und laden die Daten nach. Bei Rückkehr aus dem Hintergrund oder nach Netzunterbruch wird ebenfalls geladen; zusätzlich erfolgt ein Abgleich alle 30 Sekunden in der sichtbaren App.

Uploads und OCR sind für später vorgesehen. In der ersten Version gibt es keine Offline-Buchungen und keine Verbindung zum Dott-Konto. Die ausdrücklich gekennzeichnete Demo verwendet ausschliesslich lokale Beispieldaten.

## Vorgemerkte Erweiterungen

Screenshot-Erkennung per serverseitiger API, Guthabenhinweise, Monatsabschluss, CSV-Export, Minutenübertragungen, Paketkorrekturen und Paketverfall. Eine verbindliche «wer schuldet wem»-Abrechnung erfordert zuvor eine festgelegte Kostenverteilregel. Ein nativer iOS-Teilen-Eintrag ist eine separate spätere Erweiterung.
