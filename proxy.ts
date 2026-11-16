import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isAppRoute = createRouteMatcher(["/app(.*)"]);

// Sends signed-out visitors of /app back to the public page. This is for
// convenience only: access rules are enforced inside the Convex functions.
export default clerkMiddleware(async (auth, request) => {
  if (!isAppRoute(request)) {
    return;
  }
  const { userId } = await auth();
  if (userId === null) {
    return NextResponse.redirect(new URL("/", request.url));
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
