import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Only the API needs an account. Pages are open: `/` works for guests, `/s/*`
// shows shared notes, and unknown paths reach the 404 page instead of sign-in.
const isApiRoute = createRouteMatcher(['/api/(.*)'])
const isPublicApi = createRouteMatcher([
  '/api/share/(.*)', // share API — auth enforced per-method inside the route
  '/api/realtime/ticket', // share-link viewers need room tickets; access checked inside
  '/api/health',     // keep-alive ping from the realtime Worker; checks REALTIME_SECRET itself
])

export default clerkMiddleware(async (auth, request) => {
  if (isApiRoute(request) && !isPublicApi(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
