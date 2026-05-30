import { Search, BookOpen, Layers, Users } from "lucide-react"

const features = [
  {
    icon: Search,
    title: "Find",
    description:
      "Search across millions of papers, articles, and trusted sources in seconds with semantic precision.",
  },
  {
    icon: BookOpen,
    title: "Understand",
    description:
      "Get clear, level-appropriate explanations that break down complex ideas into digestible insights.",
  },
  {
    icon: Layers,
    title: "Synthesize",
    description:
      "Combine findings from multiple sources into coherent, cited summaries you can actually use.",
  },
  {
    icon: Users,
    title: "Collaborate",
    description:
      "Share research spaces, annotate together, and keep your whole team aligned in real time.",
  },
]

export function Features() {
  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Everything you need to research smarter
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            A complete workflow from the first question to the final insight.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-border bg-card/70 p-6 transition-colors hover:border-primary/50 hover:bg-card"
            >
              <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-secondary/60 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <feature.icon className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
