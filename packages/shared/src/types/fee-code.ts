export interface FeeCode {
  code: string;
  description: string;
  baseFee: string; // decimal as string
  modifiers: FeeCodeModifier[] | null;
  category: string;
  rulesNotes: string | null;
  effectiveDate: string; // ISO date
  endDate: string; // ISO date
}

export interface FeeCodeModifier {
  code: string;
  description: string;
  type: string;
}
