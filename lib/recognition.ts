/** Spätere API-Erweiterung. v1 lädt keine Bilder hoch und ruft keinen OCR-Anbieter auf. */
export type RecognitionResult = {
  duration_seconds: number | null;
  pause_seconds: number | null;
  ride_date_local: string | null;
  ride_time_local: string | null;
  review_reasons: string[];
};
export interface ScreenshotRecognizer {
  recognize(image: Blob, signal?: AbortSignal): Promise<RecognitionResult>;
}
// Eine künftige Implementierung läuft serverseitig. Keine API-Schlüssel im Browser.
// Der Server validiert beide Zeitwerte und berechnet die Summe selbst.
// DeepSeek Flash/OCR ist als Kandidat vorgemerkt, noch nicht auf Genauigkeit getestet.
