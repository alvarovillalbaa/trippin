import { defineTool } from "eve/tools";
import { z } from "zod";

const money = z.number().finite().nonnegative().max(1_000_000);
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export default defineTool({
  description:
    "Calculate an estimated trip total from traveler-supplied prices in one currency. No live prices or purchases. Stay and transport are total amounts; daily food and local transit are per person.",
  inputSchema: z.object({
    currency: z.string().length(3).describe("ISO currency code, for example EUR"),
    days: z.number().int().min(1).max(365),
    travelers: z.number().int().min(1).max(50),
    flightsAndLongDistanceTransport: money,
    accommodationTotal: money,
    foodAndDrinksPerPersonPerDay: money,
    localTransportPerPersonPerDay: money,
    admissionAndEventsTotal: money,
    otherCostsTotal: money,
    contingencyPercent: z.number().min(0).max(100),
  }),
  execute(input) {
    const foodAndDrinks = input.foodAndDrinksPerPersonPerDay * input.days * input.travelers;
    const localTransport = input.localTransportPerPersonPerDay * input.days * input.travelers;
    const subtotal = input.flightsAndLongDistanceTransport + input.accommodationTotal +
      foodAndDrinks + localTransport + input.admissionAndEventsTotal + input.otherCostsTotal;
    const contingency = subtotal * input.contingencyPercent / 100;
    return {
      source: "Calculation from supplied estimates; not a provider quote",
      currency: input.currency.toUpperCase(),
      breakdown: {
        flightsAndLongDistanceTransport: round(input.flightsAndLongDistanceTransport),
        accommodation: round(input.accommodationTotal),
        foodAndDrinks: round(foodAndDrinks),
        localTransport: round(localTransport),
        admissionsAndEvents: round(input.admissionAndEventsTotal),
        other: round(input.otherCostsTotal),
        contingency: round(contingency),
      },
      total: round(subtotal + contingency),
      perTraveler: round((subtotal + contingency) / input.travelers),
      perTravelerPerDay: round((subtotal + contingency) / input.travelers / input.days),
    };
  },
});
