# 💶 Financing Calculator

The **Financing** page works out what a listing would cost you every month, and whether that fits
your household.

Every job declares whether it searches to **rent** or to **buy**, and the page has one tab for each.
Both share the same household block (income for one or two people, living costs, any loan you are
already paying off) and the same rule of thumb: housing costs plus existing debt at or below 35 % of
net income.

## Renting

Portals quote Kaltmiete, households pay warm. Set the Nebenkosten surcharge once, and Fredy reports
the highest cold rent you can take on, what that comes to warm, and what is left over each month.
The renting tab asks for nothing beyond that.

## Buying

The buying tab models the purchase the way a European bank would, as an **Annuitätendarlehen**:

- the **monthly rate**, and how it splits into interest and repayment over the years
- the **Kaufnebenkosten**: Grunderwerbsteuer for your Bundesland, Notar + Grundbuch, and the
  Maklerprovision. On a 400.000 € house in NRW these add roughly 46.000 € that you have to finance
  or pay out of your own pocket
- the **Restschuld** left when the Zinsbindung runs out, which you have to refinance at whatever
  rates exist then
- the **age at which you and your partner become debt-free**
- the **highest purchase price** that keeps you inside the 35 % rule

Loan scenarios can be compared side by side, each with a Sollzins, a Tilgung, a Zinsbindung, a
monthly rate and an optional Sondertilgung. Tilgung and monthly rate describe the same thing from
opposite ends, so editing one rewrites the other and you can enter whichever figure you have. The
term is calculated at a constant Sollzins. Fredy does not guess what a follow-up loan will cost
after the Zinsbindung, it reports the Restschuld instead.

## Where the result shows up

Each tab saves and deletes on its own. Once one is saved, its verdict appears elsewhere:

- an **affordability filter** on the listings overview, next to the status and provider filters,
  plus a small verdict chip on each listing
- a **rent card or a financing card** on the listing detail page, whichever matches the job that
  found the listing

Which calculation a listing gets follows the deal type of its job, so a 1.200 € rent is never read
as a very cheap house. Nothing appears until the matching tab is filled in.

An LLM can ask the same question over MCP with the `calculate_financing` tool, which returns a
mortgage answer or a rent answer depending on the listing.

> **This is an estimate, not financial advice.** The Grunderwerbsteuer rates ship as editable
> defaults and Bundesländer change them from time to time, so check the figure for your state and
> get a binding offer from your bank before committing to anything.
