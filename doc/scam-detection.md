# 🕵️ Scam Detection

Rental fraud follows a script. The price sits far under what the street costs, the landlord cannot
make a viewing because they are abroad, the keys are promised by post, and money is wanted before
anybody has seen the flat.

Since **28.0.0** Fredy reads every new listing for those marks and warns you when enough of them
line up. It runs on the title and description already stored in the database, so it costs no
requests, needs no API key, and nothing leaves your machine.

## How a listing gets flagged

Signals are weighted, because they are not equally telling. A listing is flagged at a **score of 3
or higher**, so one weight-3 signal fires on its own, two weight-2 signals fire together, and a
single weight-2 signal never does.

| Signal | What it reads | Weight |
|---|---|---|
| `advancePayment` | Money is asked for before anyone has seen the flat | 3 |
| `keysByPost` | The keys are promised by post | 3 |
| `moneyTransferService` | Payment by a route that cannot be reversed (Western Union, gift cards) | 3 |
| `landlordAbroad` | The landlord says they are abroad | 2 |
| `noViewing` | A viewing is said to be impossible | 2 |
| `priceFarBelowMarket` | 40 % or more under the local median price per m² | 2 |

**A cheap flat is not a scam.** Finding cheap flats is what Fredy is for, so the price alone can
never flag a listing, it needs something in the text to agree with it. What does fire alone is
language that has no innocent reading in a rental ad.

Just as deliberate is what is *not* a signal: a deposit (`Kaution`, `caparra`, `fianza`), agency
fees, and a phone number or email address in the description. All three are normal, and each one
fired on a large share of honest listings.

## Languages

German, English, Italian, Spanish and Portuguese, which covers every country Fredy can search. The
same four stories are told in each of them, so the phrase lists are translations of one another.
Matching runs on normalised text (lowercased, umlauts folded, quotes stripped), and a `*` in a
phrase spans up to three words so `Besichtigung ist leider nicht möglich` matches the same entry as
`Besichtigung nicht möglich`.

## The price signal needs neighbours

`priceFarBelowMarket` compares the listing's price per m² against the **market benchmark**: the
median of comparable listings Fredy has already stored within 5 km, widening to 15 km when there are
fewer than 8 of them, and capped at 300 comparables. A listing Fredy could not place, or one in an
area with too few neighbours, simply does not carry this signal.

## Your judgement wins

Every verdict is a guess from a word list, and you know things the word list does not. On the
listing page you can **mark a listing as a scam** Fredy did not catch, or **mark a warning as no
scam** once you have looked into it. The stored decision outranks the detector in both directions
and survives every later run of the search. Press the same button again to hand the listing back to
the detector.

## Where it shows up

- a badge on the listing card in the overview and in the listings table
- a panel on the listing detail page naming every signal that fired, so you can check each one
  against the advert yourself

Nothing is filtered, hidden or deleted, and notifications are unchanged.

> **This is a guess from the wording and the price, not a verdict.** Never pay anything and never
> send documents before you have seen the flat and met the landlord.

Implementation: [`lib/services/listings/scamSignals.js`](../lib/services/listings/scamSignals.js)
(signals, weights, phrase lists) and
[`lib/services/listings/marketBenchmark.js`](../lib/services/listings/marketBenchmark.js).
