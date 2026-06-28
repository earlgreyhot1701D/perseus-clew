# Roadmap

AgentisLux is built in the open. Here is what exists today, what we are building, and what is still an
open question. No dates we might miss. No features dressed up as done.

## Here today (free)

- Scan any public page and see what an AI agent experiences when it reads your site: what it can parse,
  what it cannot, and why.
- Findings only. No fixes suggested, and no judgment.
- A plain-language agent simulation: an AI reads your page the way a retrieval agent would and reports
  what it could and could not do.
- No account. Your result is yours to read, save, and share.
- A public 50-site benchmark, with the methodology and the raw data published so anyone can check the work.

This is the front door. It stays useful.

## On the roadmap (the team tier)

The engine already does more than the free tier shows. It also scans API specifications, not just
frontends. That part runs today: it is what we used to scan the APIs in our benchmark. It is real. What
is not built yet is the team-facing version of it in the product. That is the next thing.

For teams who ship and maintain more than one product, the work shifts from "scan a page" to "know what
agents experience across everything we run." The team tier is where that lives:

- API scanning in the product, with a combined frontend-plus-API readout.
- Multiple domains and shared team reports, so a whole surface is visible in one place.
- Scheduled rescans and trend tracking, so you can see whether agent-readiness is improving over time.
- Report history, kept and comparable.

This is the part a company pays for. The free tier proves the engine works and earns the trust. The team
tier serves the teams who need it at scale. When it is ready, it will be here, described as plainly as
everything else.

## Further out (open questions, not promises)

These are the hard ones. We have a view on how to do them. We have not built them, and we will not ship
them until we can do them honestly. They need a second engine that renders JavaScript, which is a
different machine from the raw-HTML reader the product runs today.

- **An agent that acts, not just reads.** Today AgentisLux reasons over the HTML an agent receives. The
  next frontier is an agent that drives a browser: clicks, navigates several steps, fills and submits
  forms, and reports what broke along the way. That tests the interactive surface, not just the static
  page. It needs the JavaScript-rendering engine and more time and compute per scan. It is a second
  engine, not a switch we flip on the current one.
- **Scanning what sits behind a login.** Agents meet most products at the public doors (marketing, docs,
  API) long before login. A smaller, important class comes inside through the owner's own session.
  Scanning that surface is the obvious next frontier and the hardest to do safely. It needs the same
  JavaScript-rendering engine, and an architecture where AgentisLux never holds your credentials. We
  will not ask you to trust us with something we should not hold.

If and when these exist, they will be on this page first.
