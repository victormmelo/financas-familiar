import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/app') && !req.auth) {
    const login = new URL('/auth/login', req.url)
    login.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(login)
  }
  return NextResponse.next()
})

export const config = {
  matcher: ['/app/:path*'],
}
