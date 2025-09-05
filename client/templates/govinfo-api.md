# GovInfo API Guide

## Core Function (Must be included at the start of ALL code)

```javascript
async function govAPI(endpoint, opts = {}) {
  const url = endpoint.startsWith("http")
    ? `${self.location.origin}/api/browse/${endpoint}`
    : `${self.location.origin}/api/browse/https://api.govinfo.gov/${endpoint}`;

  const config = { method: opts.body ? "POST" : "GET" };

  if (opts.body) {
    config.body = JSON.stringify(opts.body);
    config.headers = { "Content-Type": "application/json" };
  }

  const response = await fetch(url, config);
  if (!response.ok) return null;

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
```

## Always Start Here: Get the OpenAPI Spec

```javascript
const apiSpec = await govAPI("govinfoapi/api-docs");
console.log(`${apiSpec.info.title} v${apiSpec.info.version}`);
console.log(`${Object.keys(apiSpec.paths).length} endpoints available`);

// Explore available endpoints
Object.keys(apiSpec.paths).forEach((path) => console.log(path));
```

## Complete API Endpoints (11 Total)

### GET /collections

List all collections with document counts.

```javascript
const collections = await govAPI("collections");
// Returns: {collections: [{collectionCode, collectionName, packageCount, granuleCount}]}
```

### GET /collections/{collection}/{lastModifiedStartDate}

Get packages modified since a date.
**Required:** `collection`, `lastModifiedStartDate` (ISO8601), `pageSize` (max 1000)
**Key Optional:** `offsetMark` (use "\*" first, then nextPage), `congress`, `docClass`, `billVersion`

```javascript
const bills = await govAPI("collections/BILLS/2024-01-01T00:00:00Z?pageSize=20&offsetMark=*");
const filtered = await govAPI(
  "collections/BILLS/2024-01-01T00:00:00Z?pageSize=20&offsetMark=*&congress=119&docClass=hr"
);
```

### GET /collections/{collection}/{startDate}/{endDate}

Get packages within date range. Same parameters as above plus `lastModifiedEndDate`.

### GET /published/{dateIssuedStartDate}

Get published documents by issue date.
**Required:** `dateIssuedStartDate` (YYYY-MM-DD), `pageSize`, `collection` (comma-separated)
**Key Optional:** `congress`, `docClass`, `offsetMark`

```javascript
const published = await govAPI(
  "published/2024-09-01?pageSize=25&collection=BILLS,CREC,FR&offsetMark=*"
);
```

### GET /published/{startDate}/{endDate}

Published documents in date range. Same parameters plus `dateIssuedEndDate`.

### GET /packages/{packageId}/summary

Get detailed package information.
**Required:** `packageId`

```javascript
const details = await govAPI("packages/BILLS-119hr5094ih/summary");
// Returns: {title, congress, members: [{role, memberName, state}], download: {txtLink, xmlLink, pdfLink}}
```

### GET /packages/{packageId}/granules

Get package sub-sections (Congressional Record, etc.).
**Required:** `packageId`, `pageSize`
**Key Optional:** `offsetMark`, `granuleClass` (HOUSE, SENATE, DAILYDIGEST, EXTENSIONS)

```javascript
const granules = await govAPI("packages/CREC-2025-09-03/granules?pageSize=20&offsetMark=*");
const houseSections = await govAPI(
  "packages/CREC-2025-09-03/granules?pageSize=20&offsetMark=*&granuleClass=HOUSE"
);
```

### GET /packages/{packageId}/granules/{granuleId}/summary

Get specific granule details.
**Required:** `packageId`, `granuleId`

### POST /search

Full-text search across documents.
**Required:** JSON body with query parameters

```javascript
// Basic search
const basic = await govAPI("search", {
  body: {
    query: "healthcare",
    pageSize: 20,
    offsetMark: "*",
  },
});

// Filtered search
const filtered = await govAPI("search", {
  body: {
    query: "healthcare congress:119 collection:BILLS docClass:hr",
    pageSize: 20,
    offsetMark: "*",
    sorts: [{ field: "lastModified", sortOrder: "DESC" }],
  },
});

// Field operators: congress:119, collection:BILLS, docClass:hr, "exact phrase"
// Sort fields: score, lastModified, dateIssued, relevancy
```

### GET /related/{accessId}

Get related documents for a package/granule.
**Required:** `accessId` (packageId or granuleId)

```javascript
const related = await govAPI("related/BILLS-119hr5094ih");
```

### GET /related/{accessId}/{collection}

Get related documents from specific collection.
**Required:** `accessId`, `collection`

## Key Collections (41 Total)

| Code     | Name                  | Documents              |
| -------- | --------------------- | ---------------------- |
| BILLS    | Congressional Bills   | 278,761                |
| USCOURTS | US Courts Opinions    | 2,018,668              |
| CREC     | Congressional Record  | 5,799 (877K granules)  |
| FR       | Federal Register      | 22,549 (985K granules) |
| CRPT     | Congressional Reports | 123,229                |
| PLAW     | Public Laws           | 5,929                  |

## Document Content Retrieval

```javascript
// Get package details first
const details = await govAPI("packages/BILLS-119hr5094ih/summary");

// Then get content (returns text automatically)
const htmlContent = await govAPI(details.download.txtLink);
const xmlContent = await govAPI(details.download.xmlLink);
// PDF requires different handling: const pdfUrl = details.download.pdfLink;
```

## Response Patterns

### Collections Response

```json
{
  "count": 278761,
  "nextPage": "https://api.govinfo.gov/collections/BILLS/...",
  "packages": [
    {
      "packageId": "BILLS-119hres674ih",
      "title": "Bill Title",
      "congress": "119",
      "docClass": "hres",
      "dateIssued": "2025-09-03"
    }
  ]
}
```

### Search Response

```json
{
  "results": [
    {
      "title": "Document Title",
      "packageId": "BILLS-119hr1234ih",
      "collectionCode": "BILLS",
      "dateIssued": "2024-09-01",
      "download": {
        "txtLink": "https://api.govinfo.gov/.../htm",
        "xmlLink": "https://api.govinfo.gov/.../xml"
      }
    }
  ],
  "count": 1393,
  "offsetMark": "next-page-token"
}
```

## Document Types

**Bills:** `hr` (House Bill), `hres` (House Resolution), `s` (Senate Bill), `sres` (Senate Resolution)
**Bill Versions:** `ih` (Introduced House), `is` (Introduced Senate), `enr` (Enrolled), `eh` (Engrossed House)

## Pagination

Use `offsetMark=*` for first page, then use `nextPage` URL from response:

```javascript
let results = await govAPI("collections/BILLS/2024-01-01T00:00:00Z?pageSize=100&offsetMark=*");
while (results.nextPage) {
  const nextEndpoint = results.nextPage.replace("https://api.govinfo.gov/", "");
  results = await govAPI(nextEndpoint);
}
```
