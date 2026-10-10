import type { LatLon } from "./types";

// Approximate coordinates of busy container ports, so most stops can be pinned on the map
// without spending an API request. Anything not listed falls back to the API's port finder.
// Keys are upper-case place names with punctuation removed.
const PORTS: Record<string, [number, number]> = {
  // South Asia
  "NHAVA SHEVA": [18.95, 72.95], "JAWAHARLAL NEHRU": [18.95, 72.95], "JNPT": [18.95, 72.95], "MUMBAI": [18.94, 72.84],
  "MUNDRA": [22.74, 69.70], "PIPAVAV": [20.91, 71.51], "HAZIRA": [21.09, 72.64], "KANDLA": [23.02, 70.22],
  "CHENNAI": [13.10, 80.30], "KATTUPALLI": [13.30, 80.34], "ENNORE": [13.26, 80.33], "TUTICORIN": [8.75, 78.20],
  "COCHIN": [9.97, 76.26], "KOCHI": [9.97, 76.26], "VIZAG": [17.69, 83.29], "VISAKHAPATNAM": [17.69, 83.29],
  "KRISHNAPATNAM": [14.25, 80.13], "KOLKATA": [22.55, 88.31], "HALDIA": [22.03, 88.10], "VALLARPADAM": [9.99, 76.26],
  "COLOMBO": [6.95, 79.85], "CHITTAGONG": [22.31, 91.80], "KARACHI": [24.84, 66.98], "PORT QASIM": [24.77, 67.33],
  // Middle East
  "JEBEL ALI": [25.01, 55.06], "DUBAI": [25.27, 55.29], "ABU DHABI": [24.81, 54.65], "KHALIFA": [24.81, 54.65],
  "SALALAH": [16.94, 54.00], "SOHAR": [24.50, 56.62], "DAMMAM": [26.50, 50.21], "JEDDAH": [21.47, 39.16],
  "KING ABDULLAH": [22.52, 39.09], "HAMAD": [25.02, 51.62], "UMM QASR": [30.03, 47.95], "AQABA": [29.45, 35.00],
  "KHOR FAKKAN": [25.35, 56.36], "BANDAR ABBAS": [27.14, 56.21], "SHUWAIKH": [29.35, 47.93],
  // East & Southeast Asia
  "SHANGHAI": [30.63, 122.07], "YANGSHAN": [30.63, 122.07], "NINGBO": [29.93, 121.85], "SHENZHEN": [22.48, 113.88],
  "YANTIAN": [22.57, 114.27], "SHEKOU": [22.47, 113.89], "CHIWAN": [22.47, 113.88], "NANSHA": [22.70, 113.65],
  "GUANGZHOU": [22.70, 113.65], "QINGDAO": [36.00, 120.27], "TIANJIN": [38.97, 117.79], "XINGANG": [38.97, 117.79],
  "XIAMEN": [24.45, 118.07], "DALIAN": [38.93, 121.65], "FUZHOU": [25.98, 119.45], "LIANYUNGANG": [34.74, 119.45],
  "HONG KONG": [22.33, 114.12], "KAOHSIUNG": [22.57, 120.31], "KEELUNG": [25.15, 121.75], "TAIPEI": [25.15, 121.38],
  "BUSAN": [35.08, 128.83], "PUSAN": [35.08, 128.83], "GWANGYANG": [34.90, 127.70], "INCHEON": [37.45, 126.60],
  "TOKYO": [35.62, 139.79], "YOKOHAMA": [35.45, 139.66], "KOBE": [34.67, 135.20], "NAGOYA": [35.05, 136.85], "OSAKA": [34.64, 135.43],
  "SINGAPORE": [1.26, 103.83], "PORT KLANG": [3.00, 101.39], "TANJUNG PELEPAS": [1.36, 103.55], "PASIR GUDANG": [1.44, 103.90],
  "PENANG": [5.42, 100.35], "LAEM CHABANG": [13.08, 100.89], "BANGKOK": [13.70, 100.57],
  "HO CHI MINH": [10.76, 106.75], "CAT LAI": [10.76, 106.79], "CAI MEP": [10.53, 107.03], "VUNG TAU": [10.35, 107.07],
  "HAIPHONG": [20.84, 106.77], "JAKARTA": [-6.10, 106.88], "TANJUNG PRIOK": [-6.10, 106.88], "SURABAYA": [-7.20, 112.73],
  "MANILA": [14.60, 120.95], "SIHANOUKVILLE": [10.64, 103.50],
  // Europe
  "ROTTERDAM": [51.95, 4.05], "ANTWERP": [51.28, 4.30], "ANTWERPEN": [51.28, 4.30], "HAMBURG": [53.53, 9.93],
  "BREMERHAVEN": [53.58, 8.53], "WILHELMSHAVEN": [53.60, 8.15], "FELIXSTOWE": [51.95, 1.32], "SOUTHAMPTON": [50.90, -1.43],
  "LONDON GATEWAY": [51.50, 0.48], "LONDON": [51.50, 0.48], "LIVERPOOL": [53.45, -3.02], "LE HAVRE": [49.48, 0.12],
  "DUNKIRK": [51.03, 2.20], "ZEEBRUGGE": [51.33, 3.20], "GDANSK": [54.40, 18.68], "GOTHENBURG": [57.69, 11.86],
  "AARHUS": [56.15, 10.23], "VALENCIA": [39.44, -0.32], "ALGECIRAS": [36.13, -5.44], "BARCELONA": [41.35, 2.16],
  "TANGIER": [35.89, -5.50], "TANGER MED": [35.89, -5.50], "SINES": [37.94, -8.86], "LISBON": [38.70, -9.10],
  "GENOA": [44.40, 8.90], "LA SPEZIA": [44.10, 9.84], "GIOIA TAURO": [38.45, 15.90], "TRIESTE": [45.62, 13.76],
  "PIRAEUS": [37.95, 23.58], "MARSAXLOKK": [35.82, 14.55], "MALTA": [35.82, 14.55], "KOPER": [45.55, 13.74],
  "ISTANBUL": [40.97, 28.70], "AMBARLI": [40.97, 28.69], "MERSIN": [36.79, 34.63], "IZMIT": [40.76, 29.90],
  "PORT SAID": [31.25, 32.32], "DAMIETTA": [31.47, 31.76], "ALEXANDRIA": [31.18, 29.87], "CONSTANTA": [44.15, 28.65],
  // Africa
  "DURBAN": [-29.87, 31.03], "CAPE TOWN": [-33.91, 18.44], "MOMBASA": [-4.06, 39.66], "DAR ES SALAAM": [-6.83, 39.29],
  "LAGOS": [6.43, 3.37], "APAPA": [6.44, 3.36], "TEMA": [5.63, 0.01], "ABIDJAN": [5.28, -4.01], "LOME": [6.13, 1.29],
  "DJIBOUTI": [11.60, 43.13], "CASABLANCA": [33.61, -7.60], "POINTE NOIRE": [-4.78, 11.83],
  // Americas
  "LOS ANGELES": [33.74, -118.27], "LONG BEACH": [33.75, -118.21], "OAKLAND": [37.80, -122.32], "SEATTLE": [47.58, -122.35],
  "TACOMA": [47.27, -122.41], "VANCOUVER": [49.29, -123.10], "PRINCE RUPERT": [54.30, -130.35], "NEW YORK": [40.67, -74.15],
  "NEWARK": [40.68, -74.15], "SAVANNAH": [32.13, -81.14], "CHARLESTON": [32.86, -79.95], "NORFOLK": [36.90, -76.33],
  "HOUSTON": [29.61, -95.00], "MIAMI": [25.77, -80.16], "BALTIMORE": [39.25, -76.57], "MONTREAL": [45.55, -73.53],
  "HALIFAX": [44.64, -63.56], "MANZANILLO": [19.07, -104.30], "LAZARO CARDENAS": [17.94, -102.18], "VERACRUZ": [19.21, -96.13],
  "COLON": [9.36, -79.88], "BALBOA": [8.95, -79.57], "CARTAGENA": [10.40, -75.53], "CALLAO": [-12.05, -77.15],
  "SANTOS": [-23.98, -46.30], "BUENOS AIRES": [-34.58, -58.37], "SAN ANTONIO": [-33.59, -71.61], "KINGSTON": [17.97, -76.81],
  "FREEPORT": [26.52, -78.77], "GUAYAQUIL": [-2.28, -79.91], "PARANAGUA": [-25.50, -48.52],
  // Oceania
  "SYDNEY": [-33.97, 151.22], "MELBOURNE": [-37.83, 144.92], "BRISBANE": [-27.38, 153.17], "FREMANTLE": [-32.05, 115.75],
  "AUCKLAND": [-36.84, 174.78], "TAURANGA": [-37.65, 176.18],
};

/** "NHAVA SHEVA, IN" / "Rotterdam (NL)" -> { name: "NHAVA SHEVA", country: "IN" }. */
export function splitPlace(place: string): { name: string; country?: string } {
  const country = place.match(/(?:,|\()\s*([A-Z]{2})\s*\)?\s*$/i)?.[1]?.toUpperCase();
  const name = place.split(/[,(]/)[0].toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
  return { name, country };
}

export function knownPort(place: string): LatLon | null {
  const { name } = splitPlace(place);
  if (!name) return null;
  const hit = PORTS[name] ?? Object.entries(PORTS).find(([k]) => name.startsWith(k + " ") || name.endsWith(" " + k))?.[1];
  return hit ? { lat: hit[0], lon: hit[1] } : null;
}
