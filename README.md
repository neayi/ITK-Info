# ITK-Info
A very simple backend to fetch some basic information on a crop in order to feed eht TIKA editor

# Culture Date API

Simple API to get sowing date, harvest date and color for a crop via ChatGPT, as well as location geocoding and climate data.

## Services

### 1. Culture Information Service

**Endpoint:** `POST /api/culture`

Get agricultural information about a specific crop, including sowing dates, harvest dates, and representative colors.

**Request Body:**
```json
{
  "culture": "maïs",
  "region": "France" // optional
}
```

**Response:**
```json
{
  "culture": "maïs",
  "region": "France",
  "average_sowing_date": "04-15",
  "end_of_season": "10-15",
  "color_hex": "#FFD700",
  "confidence": "high",
  "source_explanation": "Typical temperate sowing window; crop matures in ~180 days"
}
```

### 2. Location & Climate Service

**Endpoint:** `POST /api/location`

Geocode an address and retrieve monthly temperature and rainfall data for that location.

**Request Body:**
```json
{
  "address": "8 bd du port 75001 Paris"
}
```

**Response:**
```json
{
  "address": "8 bd du port 75001 Paris",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "postalCode": "75001",
  "monthly_temperatures": [5, 6, 9, 12, 16, 19, 21, 21, 18, 14, 9, 6],
  "monthly_rainfall": [51, 41, 48, 53, 65, 54, 63, 43, 54, 62, 51, 58],
  "confidence": "high",
  "source_explanation": "Average climate data for Paris based on long-term observations"
}
```

## Setup

### Prerequisites

- Docker and Docker Compose
- OpenAI API Key

### Environment Variables

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=80
```

### Installation & Running

```bash
# Build and start the service
docker-compose up --build

# Run in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

## Testing

### Test with cURL

**Culture Information:**
```bash
# Get information about corn in France
curl -X POST http://localhost/api/culture \
  -H "Content-Type: application/json" \
  -d '{
    "culture": "maïs",
    "region": "France"
  }'

# Get information about wheat without region
curl -X POST http://localhost/api/culture \
  -H "Content-Type: application/json" \
  -d '{
    "culture": "wheat"
  }'
```

**Location & Climate:**
```bash
# Get climate data for Paris
curl -X POST http://localhost/api/location \
  -H "Content-Type: application/json" \
  -d '{
    "address": "8 bd du port 75001 Paris"
  }'

# Get climate data for a postal code
curl -X POST http://localhost/api/location \
  -H "Content-Type: application/json" \
  -d '{
    "address": "69001"
  }'
```

### Test with JavaScript

**Culture Information:**
```javascript
// Using fetch API
async function getCultureInfo(culture, region = null) {
  const response = await fetch('http://localhost/api/culture', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      culture: culture,
      region: region
    })
  });
  
  const data = await response.json();
  console.log(data);
  return data;
}

// Example usage
getCultureInfo('maïs', 'France');
getCultureInfo('tomato');
```

**Location & Climate:**
```javascript
// Using fetch API
async function getLocationClimate(address) {
  const response = await fetch('http://localhost/api/location', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      address: address
    })
  });
  
  const data = await response.json();
  console.log(data);
  return data;
}

// Example usage
getLocationClimate('8 bd du port 75001 Paris');
getLocationClimate('Lyon');
```

**Using async/await with error handling:**
```javascript
async function testAPI() {
  try {
    // Test culture endpoint
    const cultureData = await fetch('http://localhost/api/culture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ culture: 'wheat', region: 'France' })
    }).then(res => res.json());
    
    console.log('Culture data:', cultureData);
    
    // Test location endpoint
    const locationData = await fetch('http://localhost/api/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: 'Paris' })
    }).then(res => res.json());
    
    console.log('Location data:', locationData);
    
  } catch (error) {
    console.error('API Error:', error);
  }
}

testAPI();
```

## API Response Codes

- `200` - Success
- `400` - Bad Request (missing or invalid parameters)
- `500` - Internal Server Error
- `502` - External API Error (OpenAI or Geocoding API)

## Technologies

- **Node.js 18+** - Runtime environment
- **Express 5** - Web framework
- **OpenAI GPT-4o-mini** - AI model for data generation
- **api-adresse.data.gouv.fr** - French government geocoding API
- **Docker** - Containerization

## License

MIT
