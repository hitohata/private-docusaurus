import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {

    if ((Math.floor(Math.random() * 2) % 2) === 0) {
        return NextResponse.redirect(new URL('/login', request.url))
    } else {
        return NextResponse.rewrite(new URL('/saurus/index.html', request.url))
    }
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: '/saurus/:path*',
}