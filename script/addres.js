import { getMunicipality } from './municipalities.js';
export async function getAddress(lat, lng) {
  const municipality = await getMunicipality(lat, lng);
  return municipality ? municipality.prefecture + municipality.city
    : '対象地域外または境界データなし（海上など）';
}
