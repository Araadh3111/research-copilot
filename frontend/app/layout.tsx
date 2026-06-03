import type { Metadata } from 'next'
import { Roboto, Montserrat, PT_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

// Paper design system — applied globally across the whole frontend: Roboto
// (body), Montserrat (display/headings), PT Mono (paper titles/citations),
// self-hosted via next/font. Roboto & Montserrat are variable fonts, so the full
// 300–700 range is available without enumerating weights; PT Mono is static and
// so requires an explicit weight.
const roboto = Roboto({
  subsets: ['latin'],
  variable: '--font-roboto',
  display: 'swap',
})
const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
})
const ptMono = PT_Mono({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-pt-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Researca — Literature review in 30 seconds',
  description:
    'Researca reads 20+ academic papers, ranks them by actual relevance, and synthesizes findings with real citations. Built by a researcher, for researchers.',
  icons: {
    icon: [{ url: '/logo.png', type: 'image/png' }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${roboto.variable} ${montserrat.variable} ${ptMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme before first paint to prevent a flash of the
            wrong colours. Defaults to light; honours an explicit saved choice. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
