import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  ExternalLink,
  FileText,
  Lock,
  MapPin,
  Scale,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { ThemeCycleButton } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Datenschutz, Nutzungsbedingungen & Impressum · Minutenclub",
  description:
    "Datenschutzerklärung nach Schweizer DSG (revDSG), Nutzungsbedingungen, Haftungsausschluss und Markenhinweis für Minutenclub.",
  robots: { index: false, follow: false },
};

export default function LegalPage() {
  const operatorName =
    process.env.NEXT_PUBLIC_LEGAL_OPERATOR_NAME?.trim() ||
    "Privates Freizeitprojekt «Minutenclub» (nicht-kommerziell)";
  const operatorCity =
    process.env.NEXT_PUBLIC_LEGAL_CITY?.trim() || "Zürich, Schweiz";
  const contactEmail =
    process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim() || "";

  return (
    <main className="legal-page">
      <header className="entry-header legal-header">
        <Link href="/" className="entry-brand">
          <span className="brand-icon">
            <Zap size={23} fill="currentColor" />
          </span>
          minutenclub<span className="brand-dot">.</span>
        </Link>
        <div className="entry-header-actions">
          <Link href="/" className="button secondary compact-btn">
            <ArrowLeft size={16} />
            Zurück zur App
          </Link>
          <ThemeCycleButton />
        </div>
      </header>

      <div className="legal-container">
        <section className="legal-hero">
          <span className="eyebrow">Rechtliches &amp; Transparenz · CH</span>
          <h1>Datenschutz, Nutzungsbedingungen &amp; Haftung</h1>
          <p>
            Minutenclub ist ein privates, unentgeltliches Freizeitprojekt für
            geschlossene Freundesgruppen (Invite-Only). Hier erfährst du
            transparent gemäss Schweizer Datenschutzgesetz (revDSG / DSG) und
            DSGVO, welche Daten verarbeitet werden und unter welchen Bedingungen
            die Nutzung erfolgt.
          </p>
          <nav className="legal-nav" aria-label="Abschnitte auf dieser Seite">
            <a href="#datenschutz">
              <ShieldCheck size={15} /> Datenschutzerklärung
            </a>
            <a href="#standort">
              <MapPin size={15} /> Standort-Schutz
            </a>
            <a href="#auftragsbearbeiter">
              <Database size={15} /> Hosting &amp; Sicherheit
            </a>
            <a href="#nutzungsbedingungen">
              <Scale size={15} /> Nutzungsbedingungen &amp; Haftung
            </a>
            <a href="#impressum">
              <FileText size={15} /> Impressum &amp; Markenhinweis
            </a>
          </nav>
        </section>

        <section id="datenschutz" className="panel legal-section">
          <div className="legal-section-head">
            <ShieldCheck size={21} />
            <div>
              <h2>1. Datenschutzerklärung (Schweizer DSG &amp; DSGVO)</h2>
              <small>
                Stand: November 2026 · Gültig für den Live- und Demo-Betrieb
              </small>
            </div>
          </div>

          <div className="legal-prose">
            <h3>1.1 Verantwortliche Stelle &amp; Geltungsbereich</h3>
            <p>
              Verantwortlich für die Datenbearbeitung im Rahmen dieser privaten
              Web-Applikation ist: <strong>{operatorName}</strong> (Standort:{" "}
              {operatorCity}).
              {contactEmail ? (
                <>
                  {" "}
                  Datenschutzanfragen erreichst du direkt unter{" "}
                  <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
                </>
              ) : (
                <>
                  {" "}
                  Eingeladene Club-Mitglieder erreichen die verantwortliche
                  Person jederzeit direkt über ihren jeweiligen Gruppen-Admin
                  oder über die in der App integrierte Feedback-Funktion;
                  externe Anfragen können zudem über das öffentliche
                  Projekt-Repository gestellt werden.
                </>
              )}
            </p>

            <h3>1.2 Grundsatz der Datenminimierung (kein E-Mail-Zwang)</h3>
            <p>
              Minutenclub verzichtet bewusst auf die Erhebung von privaten
              E-Mail-Adressen, Telefonnummern, Wohnadressen, Ausweisdaten oder
              Zahlungsmitteln. Für die Anmeldung genügt ein frei wählbarer{" "}
              <strong>Benutzername</strong> (z. B. ein Spitzname) sowie ein{" "}
              <strong>Passwort</strong>. Technisch wird der Benutzername für den
              Authentifizierungsdienst ausschliesslich auf eine nicht
              zustellbare interne Platzhalterkennung (
              <code>&lt;benutzername&gt;@users.minutenclub.local</code>)
              abgebildet; Passwörter werden niemals im Klartext, sondern
              ausschliesslich kryptografisch gehasht gespeichert.
            </p>

            <h3>1.3 Welche Daten konkret bearbeitet werden</h3>
            <ul>
              <li>
                <strong>Konto- und Gruppenmitgliedschaftsdaten:</strong>{" "}
                Benutzername, gewählter Anzeigename innerhalb der Gruppe, Rolle
                (<code>Admin</code> oder <code>Mitglied</code>), Aktivstatus,
                bereits bestätigte oder übersprungene Karten der Einführung,
                Zeitpunkt der letzten Passwortaktualisierung sowie freiwillige
                Hinweise bei einer Passwort-Zurücksetzungsanfrage an den
                Gruppen-Admin.
              </li>
              <li>
                <strong>Fahrten-, Paket- und Minutenbuchungen:</strong>{" "}
                Zeitpunkt einer erfassten Fahrt, Fahr- und Pausierdauer,
                abgezogene Minuten, optionale Notizen, allfällige Stornogründe
                (inkl. Zeitpunkt und ausführendem Admin) sowie dokumentierte
                Paketkäufe, Kostenbeiträge in CHF/Rappen und interne
                Minutengutschriften.
              </li>
              <li>
                <strong>Freiwillige Rückmeldungen (Feedback):</strong> Wenn du
                das Feedback-Fenster nutzt, werden Kategorie, Nachrichtentext
                und die aktuelle Unterseite gespeichert. Diese Einträge sind
                ausschliesslich für dich selbst und aktive Gruppen-Admins
                sichtbar.
              </li>
              <li>
                <strong>Reiner Demo-Modus:</strong> Nutzt du «Demo
                ausprobieren», verlässt keine deiner Eingaben dein Gerät; alle
                Beispieldaten bleiben ausschliesslich lokal in deinem Browser (
                <code>localStorage</code>).
              </li>
            </ul>

            <h3>1.4 Zweck &amp; Rechtsgrundlagen</h3>
            <p>
              Die Bearbeitung erfolgt ausschliesslich zum Betrieb des privaten
              Gruppen-Minutenkontos (Bereitstellung der gemeinsamen Übersicht,
              Synchronisation zwischen euren Geräten, Verhinderung doppelter
              Buchungen), zur Abwehr von Missbrauch und Cyberangriffen
              (überwiegendes Sicherheitsinteresse gemäss Art. 31 Abs. 1 DSG bzw.
              Art. 6 Abs. 1 lit. f DSGVO) sowie – bei Standortangaben und
              Feedback – auf Basis deiner freiwilligen Einwilligung (Art. 6 Abs.
              6 DSG bzw. Art. 6 Abs. 1 lit. a DSGVO). Eine Weitergabe zu Werbe-,
              Analyse- oder Profiling-Zwecken ist ausgeschlossen.
            </p>
          </div>
        </section>

        <section id="standort" className="panel legal-section">
          <div className="legal-section-head">
            <MapPin size={21} />
            <div>
              <h2>2. Freiwillige Einmal-Standortdaten (Privacy by Design)</h2>
              <small>
                Kein Hintergrund-Tracking · Lokale Zuordnung · Gerundete
                Koordinaten
              </small>
            </div>
          </div>

          <div className="legal-prose">
            <ul>
              <li>
                <strong>Ausschliesslich auf aktiven Tipp:</strong> Die App ruft
                deinen Standort niemals beim Öffnen der Seite und niemals
                laufend im Hintergrund ab (<code>watchPosition</code> wird
                technisch nicht verwendet). Ein Standortabruf über{" "}
                <code>navigator.geolocation.getCurrentPosition</code> erfolgt
                einzig in dem Moment, in dem du aktiv auf den Standort-Button
                beim Entsperren oder Beenden einer Fahrt tippst.
              </li>
              <li>
                <strong>
                  Automatische Vergröberung &amp; Schweizer Adressauflösung:
                </strong>{" "}
                Erfasste Koordinaten werden vor dem Speichern auf{" "}
                <strong>4 Dezimalstellen (ca. 11 Meter)</strong> gerundet.
                Bekannte Crew-Orte (im 100-m-Umkreis) werden lokal zugeordnet;
                für übrige Strassenadressen erfolgt ausschliesslich im Moment
                deines Standort-Tipps eine Abfrage an das amtliche
                Gebäuderegister des Bundesamts für Landestopografie{" "}
                <strong>swisstopo (geo.admin.ch, Schweiz)</strong> – ohne
                Werbe-Tracking und ohne Google/Apple Maps.
              </li>
              <li>
                <strong>Jederzeit optional &amp; widerrufbar:</strong> Jede
                Fahrt kann komplett ohne Start- oder Zielort gespeichert werden.
                Eine einmal erteilte Browser-Standortfreigabe kannst du
                jederzeit in den Einstellungen von Safari, Chrome, iOS oder
                Android widerrufen. Kamera und Mikrofon sind per{" "}
                <code>Permissions-Policy</code> dauerhaft gesperrt.
              </li>
            </ul>
          </div>
        </section>

        <section id="auftragsbearbeiter" className="panel legal-section">
          <div className="legal-section-head">
            <Lock size={21} />
            <div>
              <h2>
                3. Sicherheitsdaten, Hosting, Auftragsbearbeiter &amp; Speicher
              </h2>
              <small>
                Datenbankstandort Zürich (eu-central-2) · Keine Werbe-Cookies
              </small>
            </div>
          </div>

          <div className="legal-prose">
            <h3>3.1 Datenschutzfreundlicher DDoS- &amp; Brute-Force-Schutz</h3>
            <p>
              Um automatisierte Registrierungen und Passwort-Spam zu verhindern,
              ist die Selbstregistrierung streng auf gültige Einladungscodes
              beschränkt (<strong>Invite-Only</strong>). Bei Aufrufen der
              öffentlichen Konto-Endpunkte wird aus der Verbindungs-IP-Adresse
              lediglich ein{" "}
              <strong>gekürzter kryptografischer SHA-256-Hash</strong> für ein
              10-Minuten-Zeitfenster gebildet (max. 5 Versuche pro 10 Minuten).
              Klartext-IP-Adressen werden in der Anwendungsdatenbank nicht
              gespeichert.
            </p>

            <h3>
              3.2 Eingesetzte Infrastruktur-Dienstleister (Auftragsbearbeiter)
            </h3>
            <ul>
              <li>
                <strong>
                  Supabase (Datenbank, Auth, Edge Functions &amp; Realtime):
                </strong>{" "}
                Bereitgestellt durch Supabase Inc. Die Projektdatenbank wird im
                Rechenzentrum{" "}
                <strong>Zürich, Schweiz (Region eu-central-2)</strong>{" "}
                betrieben. Soweit im Rahmen des technischen Betriebs oder
                Supports Metadaten durch Supabase Inc. (USA) einsehbar sind,
                stützt sich die Übermittlung auf das Swiss-U.S. Data Privacy
                Framework bzw. die anerkannten Standarddatenschutzklauseln
                gemäss Art. 16 Abs. 2 DSG.
              </li>
              <li>
                <strong>Vercel (Web-Hosting, WAF &amp; Speed Insights):</strong>{" "}
                Die statische Web-Oberfläche wird über das globale Edge-Netzwerk
                der Vercel Inc. (USA / EU-Edge-Knoten) ausgeliefert. Zum Schutz
                vor Angriffen verarbeitet die Vercel Web Application Firewall
                (WAF) technische Verbindungsdaten (inkl. IP-Adresse,
                Browser-Header und Kontinent-Zuordnung für
                Sicherheits-Challenges ausserhalb Europas). Zusätzlich erfasst{" "}
                <strong>Vercel Speed Insights</strong> anonymisierte technische
                Ladezeit-Kennzahlen (Core Web Vitals) ohne Cookies und ohne
                nutzerübergreifende Werbeprofile. Rechtsgrundlage für allfällige
                Drittlandtransfers in die USA sind das Swiss-U.S. Data Privacy
                Framework sowie Standardvertragsklauseln.
              </li>
            </ul>

            <h3>3.3 Lokaler Browser-Speicher statt Tracking-Cookies</h3>
            <p>
              Minutenclub verwendet <strong>keine</strong> Werbe-Cookies,
              Social-Media-Pixel oder Drittanbieter-Tracker. Im lokalen Speicher
              deines Browsers (<code>localStorage</code> /{" "}
              <code>sessionStorage</code>) werden ausschliesslich technisch
              erforderliche Einträge abgelegt: deine aktuelle Anmeldesitzung,
              deine Designwahl (Hell/Dunkel/System), der Tourfortschritt in der
              lokalen Demo, ein laufender Entsperr-Timer, ein übergebener
              Einladungscode sowie allfällige lokale Demo-Daten.
            </p>

            <h3>
              3.4 Sichtbarkeit (Row-Level Security), Speicherdauer &amp; deine
              Rechte
            </h3>
            <p>
              Dank strikter Datenbank-Zugriffsregeln (Row-Level Security) sind
              Mitgliedsnamen, Fahrten und Guthaben ausschliesslich für aktive
              Mitglieder derselben privaten Gruppe sichtbar. Die Daten bleiben
              gespeichert, solange eure Gruppe aktiv genutzt wird. Du kannst
              jederzeit deinen Anzeigenamen ändern, dein Passwort aktualisieren
              oder über euren Gruppen-Admin die Deaktivierung bzw. vollständige
              Löschung deines Kontos verlangen.
            </p>
            <p>
              Nach dem Schweizer Datenschutzgesetz (Art. 25 ff. DSG) hast du
              jederzeit das Recht auf <strong>Auskunft</strong>,{" "}
              <strong>Berichtigung</strong>, <strong>Löschung</strong> sowie{" "}
              <strong>Datenherausgabe</strong>. Zuständige
              Datenschutz-Aufsichtsbehörde in der Schweiz ist der{" "}
              <a
                href="https://www.edoeb.admin.ch"
                target="_blank"
                rel="noreferrer"
              >
                Eidgenössische Datenschutz- und Öffentlichkeitsbeauftragte
                (EDÖB) <ExternalLink size={13} />
              </a>
              .
            </p>
          </div>
        </section>

        <section id="nutzungsbedingungen" className="panel legal-section">
          <div className="legal-section-head">
            <Scale size={21} />
            <div>
              <h2>4. Nutzungsbedingungen &amp; Haftungsausschluss</h2>
              <small>Regeln für die private Nutzung im Freundeskreis</small>
            </div>
          </div>

          <div className="legal-prose">
            <h3>4.1 Privater, geschlossener Nutzerkreis (Invite-Only)</h3>
            <p>
              Minutenclub ist ein rein privates, nicht-kommerzielles Hilfstool
              für persönlich bekannte Freundesgruppen. Die Registrierung im
              Live-Betrieb ist nur mit einem gültigen Einladungscode oder durch
              direkte Anlage durch einen Gruppen-Admin gestattet.
              Einladungscodes und Zugangsdaten dürfen nicht öffentlich
              verbreitet, verkauft oder an unbekannte Dritte weitergegeben
              werden. Gruppen-Admins können Zugänge und Einladungslinks
              jederzeit ohne Angabe von Gründen sperren.
            </p>

            <h3>
              4.2 Keine Zahlungsabwicklung &amp; unverbindliche Richtwerte
            </h3>
            <p>
              Die App wickelt{" "}
              <strong>
                keinerlei Zahlungen, Inkasso- oder Finanzdienstleistungen
              </strong>{" "}
              ab. Sämtliche in der App angezeigten Minutenstände, Kontingente
              und geschätzten CHF-Verbrauchswerte dienen ausschliesslich als
              unverbindliche interne Gedächtnisstütze innerhalb eurer privaten
              Gruppe und begründen keine rechtlich durchsetzbaren Forderungen
              gegen den Projektbetreiber.
            </p>

            <h3>
              4.3 Eigenverantwortung im Strassenverkehr &amp; Drittanbieter-AGB
            </h3>
            <p>
              Minutenclub vermietet keine Fahrzeuge, entsperrt keine Fahrzeuge
              technisch über fremde Schnittstellen und greift nicht auf fremde
              Anbieter-Konten zu (der Button «Dott entsperren» startet lediglich
              einen lokalen Zeitmesser in dieser Web-App). Jede Fahrt im
              öffentlichen Raum erfolgt auf alleinige Verantwortung und Gefahr
              der fahrenden Person unter Beachtung des Schweizer
              Strassenverkehrsgesetzes (SVG) sowie der jeweils gültigen
              Vertrags-, Versicherungs- und Nutzungsbedingungen des betreffenden
              Mobilitätsanbieters. Minutenclub fordert ausdrücklich nicht dazu
              auf, Nutzungsbedingungen von Drittanbietern zu verletzen.
            </p>

            <h3>4.4 Gewährleistungs- und Haftungsausschluss (Art. 100 OR)</h3>
            <p>
              Die Bereitstellung dieser privaten Web-Applikation erfolgt
              unentgeltlich «wie besehen» (<em>as is</em>) aus reiner
              Gefälligkeit. Es besteht kein Anspruch auf ununterbrochene
              Verfügbarkeit, Fehlerfreiheit, korrekte Berechnungen oder
              dauerhafte Datenspeicherung. Soweit gesetzlich zulässig (insb.
              unter Vorbehalt von Art. 100 Abs. 1 OR bei rechtswidriger Absicht
              oder grober Fahrlässigkeit), wird <strong>jede Haftung</strong>{" "}
              des Projektbetreibers sowie der Gruppen-Admins für direkte,
              indirekte oder mittelbare Schäden, Datenverluste, Fehlbeträge,
              Bussen, Personen- oder Sachschäden vollumfänglich ausgeschlossen.
            </p>

            <h3>
              4.5 Verbot missbräuchlicher Zugriffe &amp; anwendbares Recht
            </h3>
            <p>
              Automatisierte Abfragen (Scraping, Bots), Lasttests,
              Brute-Force-Versuche oder das Umgehen von Sicherheits- und
              Rate-Limit-Mechanismen sind untersagt. Auf sämtliche
              Rechtsbeziehungen im Zusammenhang mit der Nutzung dieser App ist
              ausschliesslich materielles <strong>Schweizer Recht</strong>{" "}
              anwendbar. Ausschliesslicher Gerichtsstand ist – soweit gesetzlich
              zulässig – <strong>Zürich, Schweiz</strong>.
            </p>
          </div>
        </section>

        <section id="impressum" className="panel legal-section">
          <div className="legal-section-head">
            <FileText size={21} />
            <div>
              <h2>5. Impressum, Betreiberhinweis &amp; Markenrecht</h2>
              <small>
                Unabhängiges Freizeitprojekt · Keine Verbindung zu Dott
              </small>
            </div>
          </div>

          <div className="legal-prose">
            <h3>5.1 Betreiberhinweis (Art. 3 Abs. 1 lit. s UWG)</h3>
            <p>
              Da Minutenclub rein privat, unentgeltlich und ohne jeglichen
              geschäftlichen Waren- oder Dienstleistungsverkehr betrieben wird,
              unterliegt das Projekt keiner gewerblichen Impressumspflicht nach
              Art. 3 Abs. 1 lit. s des Schweizer Bundesgesetzes gegen den
              unlauteren Wettbewerb (UWG). Verantwortlich für die technische
              Bereitstellung ist: <strong>{operatorName}</strong> (
              {operatorCity}
              {contactEmail ? (
                <>
                  {" "}
                  · <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                </>
              ) : null}
              ). Quellcode und Kontaktmöglichkeit für technische Hinweise:{" "}
              <a
                href="https://github.com/dnd67/dott-minuten"
                target="_blank"
                rel="noreferrer"
              >
                github.com/dnd67/dott-minuten <ExternalLink size={13} />
              </a>
              .
            </p>

            <h3>5.2 Unabhängigkeit &amp; Markenhinweis</h3>
            <p>
              <strong>Keine Verbindung zu Dott:</strong> Dieses Projekt steht in{" "}
              <strong>keinerlei</strong> wirtschaftlicher, rechtlicher,
              organisatorischer oder technischer Verbindung zu{" "}
              <em>
                Dott / TIER-Dott (Ridedott B.V. bzw. verbundenen Gesellschaften)
              </em>{" "}
              und wird von diesen weder gesponsert noch unterstützt oder
              genehmigt. Alle genannten Marken- und Produktnamen sind Eigentum
              ihrer jeweiligen Rechtsinhaber und werden hier ausschliesslich zur
              rein beschreibenden Erklärung des privaten Nutzungszwecks im
              Freundeskreis verwendet.
            </p>
          </div>
        </section>

        <div className="legal-bottom-cta">
          <Link href="/" className="button primary">
            <ArrowLeft size={17} /> Zurück zum Minutenclub
          </Link>
        </div>
      </div>
    </main>
  );
}
