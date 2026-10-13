/**
 * Draft rental agreement template: English only, on purpose.
 *
 * This is NOT legal text. It is a skeleton listing the parts an agreement
 * usually has, with recorded deal facts filled in, and a placeholder where
 * counsel must write each clause. Nothing here states a legal right, duty,
 * penalty or tax. It must be reviewed and completed by qualified local
 * counsel before any operational use, and any Khmer or Chinese version must
 * be prepared by counsel, not machine-translated.
 */
export const agreementDraft = {
  title: "Draft rental agreement template",
  banner: "DRAFT TEMPLATE FOR REVIEW BY QUALIFIED LOCAL COUNSEL - NOT FOR USE AS IT IS",
  intro:
    "This is a skeleton only. It contains no legal terms. Every clause below is a placeholder that qualified local counsel must write or approve. Recorded facts from the CRM are shown so counsel can check them against the signed documents.",
  partiesTitle: "Parties",
  landlordLabel: "Landlord (name as in the title or authorisation document)",
  tenantLabel: "Tenant (name as in the identity document)",
  agentLabel: "Agency and responsible agent",
  propertyTitle: "Property",
  termsTitle: "Recorded commercial terms (to be verified)",
  clausesTitle: "Clauses (to be drafted by counsel)",
  placeholder: "[Clause to be drafted by qualified local counsel]",
  clauses: [
    "Term of the lease and renewal",
    "Rent, payment dates and payment method",
    "Security deposit and its return",
    "Advance rent",
    "Use of the property",
    "Maintenance and repairs",
    "Utilities and service charges",
    "Taxes and fees",
    "Subletting and assignment",
    "Entry and inspection",
    "Early termination and notice",
    "Handover and condition report",
    "Governing law and dispute resolution",
    "Language of the agreement",
  ],
  signaturesTitle: "Signatures",
  signaturesNote:
    "Signature blocks are intentionally left empty. This template has not been signed or approved by anyone.",
  signatureLines: ["Landlord", "Tenant", "Witness (if required by counsel)"],
  commissionNote:
    "The agency's commission arrangement is a separate matter between the agency and its client and is not part of this template.",
} as const;
