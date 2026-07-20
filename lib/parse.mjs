// Shared parsing helpers used by both /api/culture and /api/location.

/**
 * Parse a JSON object out of a raw model response, tolerating cases where the
 * model wraps the JSON in prose. Returns null if no valid JSON object is found.
 */
export function parseModelJson(raw) {
  if (typeof raw !== "string") return null;

  try {
    return JSON.parse(raw);
  } catch (e) {
    const jsonMatch = raw.match(/({[\s\S]*})/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

/**
 * Extract latitude/longitude/postalCode/city/department/region/country from an
 * api-adresse.data.gouv.fr GeoJSON feature. `properties.context` is formatted
 * as "depcode, department name, region name".
 */
export function parseGeocodeFeature(feature) {
  const result = {
    latitude: null,
    longitude: null,
    postalCode: null,
    city: null,
    department: null,
    region: null,
    country: null
  };

  if (!feature) return result;

  const coords = feature.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length === 2) {
    result.longitude = coords[0];
    result.latitude = coords[1];
  }

  const props = feature.properties || {};
  result.postalCode = props.postcode || null;
  result.city = props.city || null;

  if (props.context) {
    const [, contextDepartment, contextRegion] = props.context.split(",").map((s) => s.trim());
    result.department = contextDepartment || null;
    result.region = contextRegion || null;
  }

  if (result.city) {
    result.country = "France"; // this geocoding API only covers French addresses
  }

  return result;
}
