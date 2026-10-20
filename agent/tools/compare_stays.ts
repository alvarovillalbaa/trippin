import { defineTool } from "eve/tools";
import { z } from "zod";

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export default defineTool({
  description:
    "Compare accommodation costs including center commutes and the traveler's optional value of time. Every price and commute duration must be supplied; does not search inventory or check availability.",
  inputSchema: z.object({
    currency: z.string().length(3),
    nights: z.number().int().min(1).max(365),
    daysWithCenterCommute: z.number().int().min(0).max(366),
    travelers: z.number().int().min(1).max(50),
    valueOfOneHourPerPerson: z.number().finite().min(0).max(10_000),
    options: z.array(z.object({
      name: z.string().min(1).max(120),
      pricePerNightForGroup: z.number().finite().min(0).max(1_000_000),
      feesTotalForGroup: z.number().finite().min(0).max(1_000_000),
      centerRoundTripPerPerson: z.number().finite().min(0).max(10_000),
      centerOneWayMinutes: z.number().finite().min(0).max(1_440),
    })).min(2).max(8),
  }),
  execute(input) {
    return {
      source: "Comparison of supplied estimates; availability unverified",
      currency: input.currency.toUpperCase(),
      options: input.options.map((option) => {
        const accommodation = option.pricePerNightForGroup * input.nights + option.feesTotalForGroup;
        const commuteCost = option.centerRoundTripPerPerson * input.travelers * input.daysWithCenterCommute;
        const commuteHoursPerPerson = option.centerOneWayMinutes * 2 * input.daysWithCenterCommute / 60;
        const valueOfCommuteTime = commuteHoursPerPerson * input.travelers * input.valueOfOneHourPerPerson;
        return {
          name: option.name,
          accommodation: round(accommodation),
          commuteCost: round(commuteCost),
          cashTotal: round(accommodation + commuteCost),
          commuteHoursPerPerson: round(commuteHoursPerPerson),
          valueOfCommuteTime: round(valueOfCommuteTime),
          totalIncludingValueOfTime: round(accommodation + commuteCost + valueOfCommuteTime),
        };
      }).sort((a, b) => a.totalIncludingValueOfTime - b.totalIncludingValueOfTime),
      note: "Time value is a comparison aid, not money actually spent. Other trip costs are excluded.",
    };
  },
});
