# Stand und nächste Schritte

[Zur Übersicht](../README.md) · [Einrichtung](setup.md)

## Implementiert

- Next.js/TypeScript-Oberfläche für Desktop und iPhone mit Home-Bildschirm-Manifest.
- Supabase-Anmeldung, Gruppenstart und Einladungscodes.
- Manuelle Fahrten mit Fahr- und Pausenminuten.
- Eigene Anzeigenamen ändern; Admins können alle Mitgliedsnamen bearbeiten.
- Storno-Verlauf mit Zeitpunkt, Grund, ausführender Person und zurückgebuchten Minuten.
- Admin-Gutschriften, Paketkäufe, Mitgliederrollen und Fahrtstornos.
- Journalbasierte Salden, Verbrauchsstatistik und gekennzeichnete Kostenschätzungen.
- Gemeinsame Aufladungen mit Paketpreis, Einzelbeiträgen und automatisch anteilig gutgeschriebenen Minuten.
- Startseite mit eigenem Rest/Verbrauch, Gruppenrest, Restguthaben der anderen und überlagerten Kontingent-/Verbrauchsbalken.
- Gemeinsame Dashboard-Abfrage, Realtime-Hinweise, Abgleich nach Rückkehr und periodisches Nachladen.
- Getrennte lokale Demo mit Oskar, August und Max.
- SQL-Migration mit RLS und Idempotenz, automatisierte Fach- und Datenbanktests.
- Vorbereitete Schnittstelle und Regeln für eine spätere Screenshot-API.

## Für euren echten Betrieb noch nötig

1. Supabase- und Vercel-Konten erstellen und gemäss [Anleitung](setup.md) verbinden.
2. Migration einmal ausführen, E-Mail-Versand und erlaubte Login-Weiterleitungen konfigurieren.
3. Oskars Gruppe erstellen, August und Max mit eigenen Logins einladen.
4. Echte Paketkäufe und Guthabenverteilungen erfassen.
5. Den dokumentierten Abnahmelauf auf zwei Geräten durchführen, einschliesslich Realtime, Hintergrundwechsel und Netzunterbruch.
6. Passende Backups und Wiederherstellung prüfen, tatsächliche Anbieterlimits und Kosten kontrollieren.

Lokale automatisierte Prüfungen enthalten keine Anmeldung bei euren noch nicht angelegten Cloud-Konten. Der Browser-Smoke-Test der Demo ersetzt keinen echten Zwei-iPhone-Test.

## Danach

Zunächst nach Bedarf: CSV-Export, Guthabenhinweise, Gegenbuchungen für fehlerhafte Admin-Gutschriften und Paketkäufe, Minutenübertragungen sowie Paketverfall. Vor einer verbindlichen Ausgleichsrechnung gemeinsam die Preisverteilung und Rundung von Restbeträgen festlegen.

Screenshot-Erkennung erst nach einem annotierten Testset und geprüfter Genauigkeit aktivieren. DeepSeek Flash/OCR sind vorgemerkt; die aktuelle Version benötigt keinen Anbieter-Key und ruft keine Bilderkennungs-API auf. Datenschutz, Originalbild-Aufbewahrung, OCR-Auftragsverwaltung und Duplikatprüfung sind Teil dieser späteren Erweiterung.
