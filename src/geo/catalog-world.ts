import type { CountryConfig } from "./types.js";

export const WORLD_COUNTRIES: readonly CountryConfig[] = [
  {
    code: "DE", name: "Germany", locale: "de-DE",
    warmSites: ["https://www.spiegel.de/", "https://www.tagesschau.de/", "https://www.bild.de/", "https://www.wetter.com/"],
    cities: [
      { region: "BE", city: "Berlin", timezone: "Europe/Berlin", weight: 25, latitude: 52.52, longitude: 13.405 },
      { region: "BY", city: "Munich", timezone: "Europe/Berlin", weight: 20, latitude: 48.1351, longitude: 11.582 },
      { region: "HH", city: "Hamburg", timezone: "Europe/Berlin", weight: 18, latitude: 53.5511, longitude: 9.9937 },
      { region: "NW", city: "Cologne", timezone: "Europe/Berlin", weight: 17, latitude: 50.9375, longitude: 6.9603 },
      { region: "HE", city: "Frankfurt", timezone: "Europe/Berlin", weight: 12, latitude: 50.1109, longitude: 8.6821 },
      { region: "BW", city: "Stuttgart", timezone: "Europe/Berlin", weight: 8, latitude: 48.7758, longitude: 9.1829 },
    ],
  },
  {
    code: "FR", name: "France", locale: "fr-FR",
    warmSites: ["https://www.lemonde.fr/", "https://www.lefigaro.fr/", "https://www.francetvinfo.fr/", "https://meteofrance.com/"],
    cities: [
      { region: "IDF", city: "Paris", timezone: "Europe/Paris", weight: 45, latitude: 48.8566, longitude: 2.3522 },
      { region: "ARA", city: "Lyon", timezone: "Europe/Paris", weight: 15, latitude: 45.764, longitude: 4.8357 },
      { region: "PAC", city: "Marseille", timezone: "Europe/Paris", weight: 15, latitude: 43.2965, longitude: 5.3698 },
      { region: "OCC", city: "Toulouse", timezone: "Europe/Paris", weight: 10, latitude: 43.6047, longitude: 1.4442 },
      { region: "NAQ", city: "Bordeaux", timezone: "Europe/Paris", weight: 8, latitude: 44.8378, longitude: -0.5792 },
      { region: "HDF", city: "Lille", timezone: "Europe/Paris", weight: 7, latitude: 50.6292, longitude: 3.0573 },
    ],
  },
  {
    code: "ES", name: "Spain", locale: "es-ES",
    warmSites: ["https://elpais.com/", "https://www.elmundo.es/", "https://www.marca.com/", "https://www.aemet.es/"],
    cities: [
      { region: "MD", city: "Madrid", timezone: "Europe/Madrid", weight: 40, latitude: 40.4168, longitude: -3.7038 },
      { region: "CT", city: "Barcelona", timezone: "Europe/Madrid", weight: 35, latitude: 41.3874, longitude: 2.1686 },
      { region: "VC", city: "Valencia", timezone: "Europe/Madrid", weight: 13, latitude: 39.4699, longitude: -0.3763 },
      { region: "AN", city: "Seville", timezone: "Europe/Madrid", weight: 12, latitude: 37.3891, longitude: -5.9845 },
    ],
  },
  {
    code: "IT", name: "Italy", locale: "it-IT",
    warmSites: ["https://www.corriere.it/", "https://www.repubblica.it/", "https://www.ansa.it/", "https://www.ilmeteo.it/"],
    cities: [
      { region: "LAZ", city: "Rome", timezone: "Europe/Rome", weight: 35, latitude: 41.9028, longitude: 12.4964 },
      { region: "LOM", city: "Milan", timezone: "Europe/Rome", weight: 35, latitude: 45.4642, longitude: 9.19 },
      { region: "CAM", city: "Naples", timezone: "Europe/Rome", weight: 15, latitude: 40.8518, longitude: 14.2681 },
      { region: "PIE", city: "Turin", timezone: "Europe/Rome", weight: 15, latitude: 45.0703, longitude: 7.6869 },
    ],
  },
  {
    code: "NL", name: "Netherlands", locale: "nl-NL",
    warmSites: ["https://nos.nl/", "https://www.nu.nl/", "https://www.telegraaf.nl/", "https://www.buienradar.nl/"],
    cities: [
      { region: "NH", city: "Amsterdam", timezone: "Europe/Amsterdam", weight: 45, latitude: 52.3676, longitude: 4.9041 },
      { region: "ZH", city: "Rotterdam", timezone: "Europe/Amsterdam", weight: 30, latitude: 51.9244, longitude: 4.4777 },
      { region: "UT", city: "Utrecht", timezone: "Europe/Amsterdam", weight: 15, latitude: 52.0907, longitude: 5.1214 },
      { region: "NB", city: "Eindhoven", timezone: "Europe/Amsterdam", weight: 10, latitude: 51.4416, longitude: 5.4697 },
    ],
  },
  {
    code: "IN", name: "India", locale: "en-IN",
    warmSites: ["https://timesofindia.indiatimes.com/", "https://www.ndtv.com/", "https://www.hindustantimes.com/", "https://www.thehindu.com/"],
    cities: [
      { region: "MH", city: "Mumbai", timezone: "Asia/Kolkata", weight: 25, latitude: 19.076, longitude: 72.8777 },
      { region: "DL", city: "Delhi", timezone: "Asia/Kolkata", weight: 25, latitude: 28.7041, longitude: 77.1025 },
      { region: "KA", city: "Bengaluru", timezone: "Asia/Kolkata", weight: 20, latitude: 12.9716, longitude: 77.5946 },
      { region: "TN", city: "Chennai", timezone: "Asia/Kolkata", weight: 12, latitude: 13.0827, longitude: 80.2707 },
      { region: "TG", city: "Hyderabad", timezone: "Asia/Kolkata", weight: 12, latitude: 17.385, longitude: 78.4867 },
      { region: "WB", city: "Kolkata", timezone: "Asia/Kolkata", weight: 6, latitude: 22.5726, longitude: 88.3639 },
    ],
  },
  {
    code: "SG", name: "Singapore", locale: "en-SG",
    warmSites: ["https://www.straitstimes.com/", "https://www.channelnewsasia.com/", "https://mothership.sg/"],
    cities: [
      { region: "SG", city: "Singapore", timezone: "Asia/Singapore", weight: 100, latitude: 1.3521, longitude: 103.8198 },
    ],
  },
  {
    code: "ZA", name: "South Africa", locale: "en-ZA",
    warmSites: ["https://www.news24.com/", "https://www.iol.co.za/", "https://www.timeslive.co.za/"],
    cities: [
      { region: "GP", city: "Johannesburg", timezone: "Africa/Johannesburg", weight: 45, latitude: -26.2041, longitude: 28.0473 },
      { region: "WC", city: "Cape Town", timezone: "Africa/Johannesburg", weight: 35, latitude: -33.9249, longitude: 18.4241 },
      { region: "KZN", city: "Durban", timezone: "Africa/Johannesburg", weight: 20, latitude: -29.8587, longitude: 31.0218 },
    ],
  },
  {
    code: "AE", name: "United Arab Emirates", locale: "en-AE",
    warmSites: ["https://gulfnews.com/", "https://www.khaleejtimes.com/", "https://www.thenationalnews.com/"],
    cities: [
      { region: "DU", city: "Dubai", timezone: "Asia/Dubai", weight: 65, latitude: 25.2048, longitude: 55.2708 },
      { region: "AZ", city: "Abu Dhabi", timezone: "Asia/Dubai", weight: 35, latitude: 24.4539, longitude: 54.3773 },
    ],
  },
];
