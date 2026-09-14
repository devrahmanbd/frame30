/** Canonical business identity used by visible contact details and JSON-LD. */
export const ORG_NAP = {
  legalName: "Framique Technologies Ltd.",
  brand: "Framique",
  street: "House 42, Road 11, Banani",
  district: "Banani",
  locality: "Dhaka",
  region: "Dhaka Division",
  postalCode: "1213",
  countryCode: "BD",
  country: "Bangladesh",
  phone: "+880 1700 000000",
  e164Phone: "+8801700000000",
  email: "hello@framique.com",
  supportEmail: "support@framique.com",
  salesEmail: "sales@framique.com",
  migrationEmail: "migration@framique.com",
  privacyEmail: "privacy@framique.com",
  hours: "Sunday–Thursday, 10:00–18:00 (BST)",
  openingHours: "Su-Th 10:00-18:00",
  timezone: "Asia/Dhaka",
  currency: "BDT",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=Banani%2C%20Dhaka%201213%2C%20Bangladesh",
} as const;

export function napAddressLine(): string {
  const n = ORG_NAP;
  return `${n.street}, ${n.locality} ${n.postalCode}, ${n.country}`;
}

export function napPostalAddress() {
  return {
    "@type": "PostalAddress",
    streetAddress: ORG_NAP.street,
    addressLocality: ORG_NAP.locality,
    addressRegion: ORG_NAP.region,
    postalCode: ORG_NAP.postalCode,
    addressCountry: ORG_NAP.countryCode,
  } as const;
}

export function organizationSchema(origin: string | null) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: ORG_NAP.legalName,
    alternateName: ORG_NAP.brand,
    ...(origin ? { url: origin } : {}),
    email: ORG_NAP.email,
    telephone: ORG_NAP.phone,
    address: napPostalAddress(),
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: ORG_NAP.supportEmail,
        telephone: ORG_NAP.phone,
        areaServed: ORG_NAP.countryCode,
        availableLanguage: ["bn", "en"],
      },
      {
        "@type": "ContactPoint",
        contactType: "sales",
        email: ORG_NAP.salesEmail,
        areaServed: ORG_NAP.countryCode,
        availableLanguage: ["bn", "en"],
      },
    ],
  };
}