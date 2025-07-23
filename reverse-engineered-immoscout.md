# Reverse Engineered Immoscout24's Mobile API

## What is Immoscout24?

Immobilienscout24 (commonly known as Immoscout) is one of Germany's largest and most popular real estate platforms. It serves as a marketplace where property owners, real estate agents, and property management companies can list apartments, houses, and commercial properties for rent or sale. For people searching for a new home in Germany, Immoscout is often one of the first platforms they check.

The platform allows users to filter properties based on various criteria such as location, price, size, number of rooms, and additional features like balconies or built-in kitchens. Immoscout24 is available both as a website and as a mobile application, making it accessible across different devices.

## Why do we do this?

Crawling Immoscout24 the oldschool way has become virtually impossible due to their extensive bot detection mechanisms. Immoscout has implemented various anti-scraping measures to prevent automated access to their platform. These measures can include:

1. IP-based rate limiting
2. Browser fingerprinting
3. CAPTCHA challenges
4. Behavior analysis to detect non-human patterns
5. JavaScript-based challenges that must be solved before content is displayed

These protections make it extremely difficult to reliably extract data from Immoscout using conventional web scraping approaches. Even with techniques like rotating proxies or mimicking human behavior, the bot detection systems have become increasingly effective at identifying and blocking automated access attempts.

## Mobile API Reverse Engineering

To work around these limitations, we are in the progress of reverse-engineering Immoscout24's mobile API. The mobile applications need to communicate with Immoscout's servers to retrieve listing data, and these API endpoints typically have fewer anti-bot protections than the web interface.

The mobile API provides several key endpoints:    
- Search total endpoint: Returns the total number of listings for a given query
- Search list endpoint: Retrieves the actual listings with details
- Expose endpoint: Returns detailed information about a specific listing

Challenges:    
1. Identifying the necessary endpoints and parameters required to perform searches
2. Mapping the mobile API parameters to their web counterparts to maintain compatibility with existing search URLs


## Api Specs

#### Search for Listings

`GET /search/total?{search parameters}`    
*Returns the total number of listings for the given query.*
```
curl -H "User-Agent: ImmoScout24_1410_30_._" \
     -H "Accept: application/json" \
     "https://api.mobile.immobilienscout24.de/search/total?searchType=region&realestatetype=apartmentrent&pricetype=calculatedtotalrent&geocodes=%2Fde%2Fberlin%2Fberlin"
```

---

#### Retrieve the listings
`POST /search/list?{search parameters}`   
*The body is json encoded and contains data specifying additional results (advertisements) to return. The format is as follows (It is not necessary to provide data for the specified keys.)*
  ```
  {
  "supportedResultListTypes": [],
  "userData": {}
  }
  ```
```
curl -X POST 'https://api.mobile.immobilienscout24.de/search/list?pricetype=calculatedtotalrent&realestatetype=apartmentrent&searchType=region&geocodes=%2Fde%2Fberlin%2Fberlin&pagenumber=1' \
  -H "Connection: keep-alive" \
  -H "User-Agent: ImmoScout24_1410_30_._" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"supportedResultListType":[],"userData":{}}'

```

---
#### Get details of listings
`GET /expose/{id}`
The response contains additional details not included in the listing response.
```
curl -H "User-Agent: ImmoScout24_1410_30_._" \
     -H "Accept: application/json" \
     "https://api.mobile.immobilienscout24.de/expose/158382494"
```


## Parameters 
The parameters between web and mobile are very different which is why we have to translate them. Please see [/lib/services/immoscout/immoscout-web-translator.js](https://github.com/orangecoding/fredy/blob/master/lib/services/immoscout/immoscout-web-translator.js).
