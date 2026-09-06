import React from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { ArrowRight, CalendarCheck, PenLine } from 'lucide-react';
import Navbar from '../src/components/Navbar';
import Footer from '../src/components/Footer';

import { SITE_URL } from '../lib/site';
import { listAvailableRoundupMonths, parseMonthSlug } from '../lib/task2Roundup';
import { TASK2_PROMPTS } from '../lib/task2Prompts';

const PAGE_TITLE = 'IELTS Writing Task 2 Topics 2026 (with Practice Questions)';
const PAGE_DESCRIPTION =
  'The IELTS Writing Task 2 topics that recur in 2026 — education, technology, environment, health, work and more — with real practice questions for each.';
const CANONICAL = `${SITE_URL}/ielts-writing-task-2-topics`;
const OG_IMAGE = `${SITE_URL}/api/og?title=${encodeURIComponent(
  'IELTS Writing Task 2 Topics 2026'
)}&type=guide&subtitle=${encodeURIComponent('Topic families & practice questions')}`;
const IMAGE_ALT = 'IELTS Writing Task 2 topics 2026 with practice questions';

// Visible on-page Q&As; the FAQPage JSON-LD is generated from this SAME array.
const FAQ = [
  {
    q: 'What topics come up most in IELTS Writing Task 2?',
    a: 'Task 2 questions recur within a stable set of topic families: education, technology, environment, health, work and careers, government and society, family, crime and law, media and advertising, cities and transport, tourism, and culture and globalisation. The wording changes from test to test, but the underlying themes repeat.',
  },
  {
    q: 'What are the types of IELTS Writing Task 2 questions?',
    a: 'Six task frames cover almost every Task 2 prompt: opinion (agree/disagree), discussion (discuss both views), advantages and disadvantages, problem and solution, positive or negative development, and two-part (double question). Learning to recognise the frame tells you exactly what structure the essay needs.',
  },
  {
    q: 'Are Task 2 topics different for Academic and General Training?',
    a: 'The essay format, timing and marking criteria are identical. General Training prompts tend to be slightly more everyday and community-focused (neighbours, shops, family routines), while Academic prompts lean more abstract (policy, technology, global issues) — but the topic families overlap heavily.',
  },
  {
    q: 'Can I predict my exact Task 2 question?',
    a: 'No — memorising "predicted" essays is a known trap that caps your score, because examiners spot rehearsed answers. What you can do is practise one prompt from each topic family and each task frame, so no combination on test day feels unfamiliar.',
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

// The six Task 2 frames and how to answer each.
const FRAMES_TABLE = {
  caption: 'The six IELTS Writing Task 2 question frames',
  head: ['Frame', 'Typical wording', 'How to answer'],
  rows: [
    [
      'Opinion',
      '"To what extent do you agree or disagree?"',
      'State a clear position in the introduction and defend the same position in every paragraph.',
    ],
    [
      'Discussion',
      '"Discuss both views and give your own opinion."',
      'Give one body paragraph to each view, then make your own position explicit.',
    ],
    [
      'Advantages & disadvantages',
      '"Do the advantages outweigh the disadvantages?"',
      'Cover both sides and, if asked "outweigh", deliver a clear verdict.',
    ],
    [
      'Problem & solution',
      '"What problems does this cause? What solutions are there?"',
      'Devote one paragraph to causes/problems and one to workable solutions, linked logically.',
    ],
    [
      'Positive or negative',
      '"Is this a positive or negative development?"',
      'Judge the trend explicitly — positive, negative or mixed — and justify the judgement.',
    ],
    [
      'Two-part question',
      'Two direct questions in one prompt.',
      'Answer both questions fully — one body paragraph each — or Task Response is capped.',
    ],
  ],
};

// Curated topic families. Every slug below is a REAL published Task 2 prompt
// in our database (module noted where it is a General Training prompt).
const TOPIC_FAMILIES = [
  {
    id: 'education',
    name: 'Education',
    blurb:
      'University funding, school subjects, homework and how technology is changing the classroom.',
    prompts: [
      { slug: 'should-university-education-be-free-for-everyone-p5ttxn', title: 'Should University Education Be Free for Everyone?' },
      { slug: 'free-university-tuition-1ha5az', title: 'Free University Tuition' },
      { slug: 'homework-burden-d674n0', title: 'Homework Burden' },
      { slug: 'screens-in-the-classroom-jgnr3c', title: 'Screens in the Classroom' },
      { slug: 'ielts-writing-task-2-homeschooling-versus-traditional-schooling-1l9ic0', title: 'Homeschooling Versus Traditional Schooling' },
      { slug: 'ielts-writing-task-2-should-second-languages-be-taught-in-primary-school-33bdgm', title: 'Should Second Languages Be Taught in Primary School?' },
      { slug: 'studying-abroad-1ot5vd', title: 'Studying Abroad' },
    ],
  },
  {
    id: 'technology',
    name: 'Technology',
    blurb:
      'AI, smartphones, social media and the shift to a digital-first society.',
    prompts: [
      { slug: 'artificial-intelligence-at-work-16cv70', title: 'Artificial Intelligence at Work' },
      { slug: 'ielts-writing-task-2-digital-addiction-among-young-people-tjwagc', title: 'Digital Addiction Among Young People' },
      { slug: 'smartphones-and-children-i2l7fa', title: 'Smartphones and Children' },
      { slug: 'social-media-and-friendship-105upr', title: 'Social Media and Friendship' },
      { slug: 'ielts-writing-task-2-moving-towards-a-cashless-society-1jojs1', title: 'Moving Towards a Cashless Society' },
      { slug: 'ielts-writing-task-2-the-automation-of-factory-work-xk3zzs', title: 'The Automation of Factory Work' },
      { slug: 'life-online-13h5to', title: 'Life Online' },
    ],
  },
  {
    id: 'environment',
    name: 'Environment',
    blurb:
      'Plastics, renewable energy, endangered species and who should pay for the clean-up.',
    prompts: [
      { slug: 'single-use-plastics-1mjz8y', title: 'Single-Use Plastics' },
      { slug: 'investing-in-renewable-energy-14xs2u', title: 'Investing in Renewable Energy' },
      { slug: 'protecting-endangered-species-1cvo8o', title: 'Protecting Endangered Species' },
      { slug: 'ielts-writing-task-2-the-decline-of-bee-populations-1i7z71', title: 'The Decline of Bee Populations' },
      { slug: 'ielts-writing-task-2-nuclear-power-solution-or-threat-1monuu', title: 'Nuclear Power — Solution or Threat?' },
      { slug: 'reducing-household-waste-ep1fr6', title: 'Reducing Household Waste' },
      { slug: 'city-green-spaces-mo23kj', title: 'City Green Spaces' },
    ],
  },
  {
    id: 'health',
    name: 'Health',
    blurb:
      'Fast food, sedentary lifestyles, prevention versus cure and public-health policy.',
    prompts: [
      { slug: 'fast-food-and-public-health-1n3kj8', title: 'Fast Food and Public Health' },
      { slug: 'preventive-healthcare-1wadb2', title: 'Preventive Healthcare' },
      { slug: 'the-sedentary-lifestyle-138rsm', title: 'The Sedentary Lifestyle' },
      { slug: 'ielts-writing-task-2-is-advertising-junk-food-to-children-harmful-mt4n6c', title: 'Is Advertising Junk Food to Children Harmful?' },
      { slug: 'ielts-writing-task-2-why-fewer-people-cook-meals-at-home-1196by', title: 'Why Fewer People Cook Meals at Home' },
      { slug: 'ielts-writing-task-2-traditional-remedies-or-modern-medicine-wvkf8', title: 'Traditional Remedies or Modern Medicine?' },
    ],
  },
  {
    id: 'work',
    name: 'Work & careers',
    blurb:
      'Remote work, the gig economy, four-day weeks and youth unemployment.',
    prompts: [
      { slug: 'the-remote-work-shift-oy8tdw', title: 'The Remote Work Shift' },
      { slug: 'ielts-writing-task-2-working-from-home-versus-working-in-an-office-1wohna', title: 'Working From Home Versus Working in an Office' },
      { slug: 'the-four-day-week-nrp9c2', title: 'The Four-Day Week' },
      { slug: 'ielts-writing-task-2-the-expansion-of-the-gig-economy-jt89on', title: 'The Expansion of the Gig Economy' },
      { slug: 'ielts-writing-task-2-youth-unemployment-in-modern-economies-hvltf8', title: 'Youth Unemployment in Modern Economies' },
      { slug: 'career-or-passion-1pzwuv', title: 'Career or Passion' },
      { slug: 'part-time-jobs-for-teenagers-1qbn15', title: 'Part-Time Jobs for Teenagers' },
      { slug: 'ielts-general-task-2-flexible-working-hours-1q8vgg', title: 'Flexible Working Hours', general: true },
    ],
  },
  {
    id: 'society',
    name: 'Government & society',
    blurb:
      'Public spending priorities, individual versus state responsibility, ageing populations.',
    prompts: [
      { slug: 'government-vs-individual-responsibility-d3pzkg', title: 'Government vs Individual Responsibility' },
      { slug: 'funding-the-arts-76di5o', title: 'Funding the Arts' },
      { slug: 'ielts-writing-task-2-should-museums-and-art-galleries-be-free-to-enter-me2cs3', title: 'Should Museums and Art Galleries Be Free to Enter?' },
      { slug: 'spending-on-space-exploration-1kxa2o', title: 'Spending on Space Exploration' },
      { slug: 'an-ageing-population-fer8zj', title: 'An Ageing Population' },
      { slug: 'ielts-writing-task-2-the-rise-of-household-debt-1yz8vn', title: 'The Rise of Household Debt' },
    ],
  },
  {
    id: 'family',
    name: 'Family & relationships',
    blurb:
      'Changing family structures, later marriage, caring for relatives and daily routines.',
    prompts: [
      { slug: 'ielts-writing-task-2-people-marrying-and-having-children-later-1lvh5h', title: 'People Marrying and Having Children Later' },
      { slug: 'ielts-writing-task-2-living-in-a-multigenerational-household-yl8ita', title: 'Living in a Multigenerational Household' },
      { slug: 'older-parents-1gnbo3', title: 'Older Parents' },
      { slug: 'ielts-general-task-2-caring-for-elderly-relatives-1imj8f', title: 'Caring for Elderly Relatives', general: true },
      { slug: 'ielts-general-task-2-children-and-household-chores-d25bd8', title: 'Children and Household Chores', general: true },
      { slug: 'ielts-general-task-2-the-decline-of-family-mealtimes-15wjm7', title: 'The Decline of Family Mealtimes', general: true },
    ],
  },
  {
    id: 'crime',
    name: 'Crime & law',
    blurb:
      'Punishment versus rehabilitation, surveillance and community approaches to crime.',
    prompts: [
      { slug: 'ielts-writing-task-2-should-the-death-penalty-be-abolished-1k8iwa', title: 'Should the Death Penalty Be Abolished?' },
      { slug: 'surveillance-cameras-1pzjx0', title: 'Surveillance Cameras' },
      { slug: 'community-and-crime-mhx3lc', title: 'Community and Crime' },
    ],
  },
  {
    id: 'media',
    name: 'Media & advertising',
    blurb:
      'Advertising ethics, celebrity culture and trust in the news.',
    prompts: [
      { slug: 'advertising-aimed-at-children-1f1tsg', title: 'Advertising Aimed at Children' },
      { slug: 'ielts-writing-task-2-do-celebrities-deserve-their-high-salaries-15triz', title: 'Do Celebrities Deserve Their High Salaries?' },
      { slug: 'ielts-writing-task-2-falling-public-trust-in-the-news-media-1tqnwp', title: 'Falling Public Trust in the News Media' },
      { slug: 'ielts-writing-task-2-should-online-news-be-free-or-paid-for-1vdgej', title: 'Should Online News Be Free or Paid For?' },
      { slug: 'tv-advertising-txie0d', title: 'TV Advertising' },
    ],
  },
  {
    id: 'transport',
    name: 'Cities & transport',
    blurb:
      'Congestion, public transport funding and the pull of city life.',
    prompts: [
      { slug: 'ielts-writing-task-2-reducing-traffic-congestion-in-growing-cities-1f50du', title: 'Reducing Traffic Congestion in Growing Cities' },
      { slug: 'ielts-writing-task-2-should-governments-prioritise-public-transport-over-roads-1s6p1v', title: 'Should Governments Prioritise Public Transport Over Roads?' },
      { slug: 'ielts-writing-task-2-why-so-many-people-move-to-cities-jtbbpn', title: 'Why So Many People Move to Cities' },
      { slug: 'living-in-the-city-or-the-countryside-6hc7lx', title: 'Living in the City or the Countryside' },
      { slug: 'ielts-general-task-2-traffic-around-schools-vif6ba', title: 'Traffic Around Schools', general: true },
    ],
  },
  {
    id: 'tourism',
    name: 'Tourism',
    blurb:
      'Overtourism, fragile environments and what travel does to places.',
    prompts: [
      { slug: 'ielts-writing-task-2-overcrowding-at-popular-tourist-destinations-1l8fj1', title: 'Overcrowding at Popular Tourist Destinations' },
      { slug: 'ielts-writing-task-2-tourism-in-fragile-natural-environments-1rnclr', title: 'Tourism in Fragile Natural Environments' },
      { slug: 'the-growth-of-mass-tourism-18jb32', title: 'The Growth of Mass Tourism' },
      { slug: 'tourists-and-museums-d22uqy', title: 'Tourists and Museums' },
    ],
  },
  {
    id: 'culture',
    name: 'Culture, language & globalisation',
    blurb:
      'Global English, disappearing languages and traditions in a globalised world.',
    prompts: [
      { slug: 'global-english-wi9ech', title: 'Global English' },
      { slug: 'ielts-writing-task-2-the-disappearance-of-minority-languages-zlaog0', title: 'The Disappearance of Minority Languages' },
      { slug: 'vanishing-traditions-1i23sc', title: 'Vanishing Traditions' },
      { slug: 'ielts-writing-task-2-the-spread-of-the-same-food-brands-worldwide-2bss6v', title: 'The Spread of the Same Food Brands Worldwide' },
      { slug: 'learning-a-foreign-language-19xpmz', title: 'Learning a Foreign Language' },
      { slug: 'sport-and-national-identity-1ln54f', title: 'Sport and National Identity' },
    ],
  },
];

function DataTable({ table }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="border-b border-border bg-muted/50 px-4 py-3 text-left text-sm font-semibold text-foreground">
            {table.caption}
          </caption>
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {table.head.map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row[0]} className="border-b border-border last:border-b-0 align-top">
                {row.map((cell, i) => (
                  <td
                    key={i}
                    className={`px-4 py-2.5 ${i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function IeltsWritingTask2Topics({ roundupMonths }) {
  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={CANONICAL} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={IMAGE_ALT} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <meta name="twitter:image:alt" content={IMAGE_ALT} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c') }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <Navbar />

        <main className="flex-1">
          <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            <header className="mb-8 max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                <PenLine className="h-3.5 w-3.5" />
                Writing Task 2
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                IELTS Writing Task 2 Topics 2026 (with Practice Questions)
              </h1>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarCheck className="h-4 w-4" />
                Updated 2 August 2026
              </p>

              {/* Answer capsule — the core answer, first. */}
              <div className="mt-6 rounded-xl border border-accent/30 bg-accent/10 p-5">
                <p className="leading-relaxed text-foreground">
                  <strong>
                    IELTS Writing Task 2 questions recur within stable topic families — education,
                    technology, environment, health, work, society, family, crime, media and
                    transport — asked through six task frames:
                  </strong>{' '}
                  opinion, discussion, advantages/disadvantages, problem/solution,
                  positive/negative development and two-part questions. Practise one prompt per
                  family and frame and nothing on test day will feel unfamiliar.
                </p>
              </div>
            </header>

            {/* ===================== FRAMES ===================== */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                What types of question does Task 2 ask?
              </h2>
              <p className="mt-3 max-w-3xl font-medium leading-relaxed text-foreground">
                Almost every Task 2 prompt fits one of six frames, and each frame demands a
                specific essay structure. Identify the frame before you plan a single sentence.
              </p>
              <div className="mt-5">
                <DataTable table={FRAMES_TABLE} />
              </div>
            </section>

            {/* ===================== TOPIC FAMILIES ===================== */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Which topics should I practise?
              </h2>
              <p className="mt-3 max-w-3xl font-medium leading-relaxed text-foreground">
                The families below cover the themes Task 2 keeps returning to. Every question
                linked is a real, free practice prompt from our Writing bank — open one, write
                under timed conditions, and compare against the model answer.
              </p>

              <div className="mt-6 space-y-6">
                {TOPIC_FAMILIES.map((family) => (
                  <div key={family.id} className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
                    <h3 className="text-lg font-bold text-foreground">{family.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{family.blurb}</p>
                    <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                      {family.prompts.map((prompt) => (
                        <li key={prompt.slug} className="flex items-start gap-2">
                          <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" />
                          <NextLink
                            href={`/writingquestion/${prompt.slug}`}
                            className="text-sm font-medium text-foreground no-underline transition-colors hover:text-accent"
                          >
                            {prompt.title}
                            {prompt.general ? (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                (General Training)
                              </span>
                            ) : null}
                          </NextLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Want the full list? Browse every prompt in the free{' '}
                <NextLink href="/writingquestion" className="font-semibold text-accent no-underline hover:underline">
                  IELTS Writing question bank
                </NextLink>
                .
              </p>
            </section>

            {/* ============ MONTHLY ROUNDUPS ============ */}
            <section className="mb-12">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Monthly Task 2 topic roundups
              </h2>
              <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
                A month-by-month view of the same question bank, grouped by essay frame rather than
                by subject. These pages are a practice schedule, not a prediction: nobody can tell
                you which question you will get, so the useful drill is to write one essay from each
                frame until none of them is unfamiliar.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {roundupMonths.map((month) => (
                  <NextLink
                    key={month.slug}
                    href={`/ielts-writing-task-2-topics/${month.slug}`}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground no-underline shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
                  >
                    {month.label}
                  </NextLink>
                ))}
              </div>
            </section>

            {/* ===================== FAQ ===================== */}
            <section className="mb-12">
              <h2 className="mb-6 text-2xl font-bold tracking-tight text-foreground">
                Task 2 topics FAQ
              </h2>
              <div className="space-y-4">
                {FAQ.map((item) => (
                  <div key={item.q} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-foreground">{item.q}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ===================== CTA ===================== */}
            <section className="rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Wrote an essay? Find out its band
              </h2>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Get a criterion-by-criterion estimate against all four official Writing criteria
                with the AI{' '}
                <NextLink href="/ielts-writing-checker" className="font-semibold text-accent no-underline hover:underline">
                  IELTS Writing checker
                </NextLink>
                , then see what your Writing band does to your overall score with the{' '}
                <NextLink href="/band-calculator" className="font-semibold text-accent no-underline hover:underline">
                  band calculator
                </NextLink>
                .
              </p>
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}

// The month list is resolved at BUILD time, not in the component: computing it
// from `new Date()` at module scope would run again in the browser against the
// visitor's clock and could hydrate a different list than was rendered.
export async function getStaticProps() {
  return {
    props: {
      roundupMonths: listAvailableRoundupMonths(TASK2_PROMPTS, new Date(), 6).map((slug) => parseMonthSlug(slug)),
    },
    revalidate: 60 * 60 * 24,
  };
}
