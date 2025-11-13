### HTTP Adapter

This is a generic adapter for sending notifications via HTTP requests. 
It can be configured to send notifications to any HTTP endpoint.

Request Method: `POST`  
Content Type: `application/json`  
Payload Structure:

```json
{
  "jobId": "mg1waX4RHmIzL5NDYtYp-",
  "provider": "immoscout",
  "timestamp": "2024-06-15T12:34:56Z",
  "listings": [
    {
      "address": "Str. 123, Bielefeld, Germany",
      "description": "Möbliert: Einziehen & wohlfühlen: Neu möbliert.",
      "id": "123456789",
      "imageUrl": "https://<target-url>.com/listings/123456789.jpg",
      "price": "1.240 €",
      "size":"38 m²",
      "title": "Schöne 1-Zimmer-Wohnung in Bielefeld",
      "url": "https://<target-url>.com/listings/123456789"
    }
  ]
}
```
