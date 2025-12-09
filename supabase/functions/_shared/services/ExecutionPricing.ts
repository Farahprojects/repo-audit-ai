
import { formatTokens } from "../costEstimation.ts";

export interface PriceQuote {
    estimatedTokens: number;
    totalCents: number; // Integer amount in smallest currency unit (cents)
    currency: string;
    formattedPrice: string;
    breakdown: {
        baseFee: number;
        usageCost: number;
        ratePer1k: number;
    };
}

export class ExecutionPricing {
    // Pricing Constants (USD Cents)
    private static readonly BASE_FEE_CENTS = 5; // Fixed overhead per transaction
    private static readonly DOLLARS_PER_1M_TOKENS = 15.00; // Blended rate covering Input/Output/Margin
    private static readonly CENTS_PER_TOKEN = (ExecutionPricing.DOLLARS_PER_1M_TOKENS * 100) / 1000000;

    /**
     * Calculates the price for a given token estimate.
     * @param estimatedTokens Total estimated tokens for the operation
     * @returns PriceQuote object
     */
    static calculatePrice(estimatedTokens: number): PriceQuote {
        const usageCostCents = Math.ceil(estimatedTokens * this.CENTS_PER_TOKEN);
        const totalCents = this.BASE_FEE_CENTS + usageCostCents;

        return {
            estimatedTokens,
            totalCents,
            currency: 'USD',
            formattedPrice: `$${(totalCents / 100).toFixed(2)}`,
            breakdown: {
                baseFee: this.BASE_FEE_CENTS,
                usageCost: usageCostCents,
                ratePer1k: (this.CENTS_PER_TOKEN * 1000)
            }
        };
    }

    /**
     * Formats a price quote for display (e.g., "$0.25")
     */
    static format(cents: number): string {
        return `$${(cents / 100).toFixed(2)}`;
    }
}
