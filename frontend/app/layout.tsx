import type { Metadata } from 'next'
import { PT_Mono, Playfair_Display, Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

// Living Manuscript type system — applied globally across the whole frontend
// (landing, auth and the logged-in app), self-hosted via next/font:
//   • Playfair Display → display serif for headings & the wordmark
//   • Inter            → body copy and every UI control
//   • PT Mono          → small-caps labels, paper titles and citations
// Playfair & Inter are variable fonts, so the full weight range is available
// without enumerating weights; PT Mono is static and needs an explicit weight.
const ptMono = PT_Mono({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-pt-mono',
  display: 'swap',
})
const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
})
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
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
      className={`${ptMono.variable} ${playfair.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme before first paint to prevent a flash of the
            wrong colours. The Observatory (night) is the canonical experience,
            so default to dark; an explicit saved 'light' choice gets Daybreak. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'){document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})();`,
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
