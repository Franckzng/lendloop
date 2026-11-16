import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // Clerk "Frontend API URL", set per deployment in the Convex dashboard.
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
