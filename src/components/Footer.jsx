import React from 'react';
import NextLink from 'next/link';
import Image from 'next/image';
import { Separator } from '../../components/ui/separator';
import NewsletterSignup from './NewsletterSignup';

// Pure Tailwind/shadcn Footer. No Chakra imports — renders on every page,
// including still-Chakra ones, so it must be self-contained.

// Site directory: every hub is linked from every page, so each indexable page
// is at most two clicks from anywhere (hub -> item). Keep it to hub-level
// links; the hubs themselves list their items in crawlable HTML.
const PRACTICE_LINKS = [
  { label: 'Reading', href: '/readingquestion' },
  { label: 'Writing', href: '/writingquestion' },
  { label: 'IELTS Essay Bank', href: '/ielts-essay-bank' },
  { label: 'Listening', href: '/listeningquestion' },
  { label: 'Speaking', href: '/speakingquestion' },
  { label: 'Mock Tests', href: '/mock-test' },
  { label: 'Speaking Cue Cards', href: '/ielts-speaking-cue-cards' },
  { label: 'IELTS Question Bank', href: '/ielts-question-bank' },
];

const TOOLS_LINKS = [
  { label: 'Band Estimator', href: '/band-estimator' },
  { label: 'Writing Checker', href: '/ielts-writing-checker' },
  { label: 'Band Calculator', href: '/band-calculator' },
  { label: 'AI Speaking Examiner', href: '/speaking-examiner' },
  { label: 'Pricing', href: '/pricing' },
];

const GUIDE_LINKS = [
  { label: 'IELTS Test Format', href: '/ielts-test-format' },
  { label: 'Band Descriptors', href: '/ielts-band-descriptors' },
  { label: 'Score Requirements', href: '/ielts-score-requirements' },
  { label: 'Writing Task 2 Topics', href: '/ielts-writing-task-2-topics' },
  { label: 'IELTS vs TOEFL, PTE & Duolingo', href: '/ielts-vs-toefl-pte-duolingo' },
  { label: 'Writing Checker Accuracy', href: '/ielts-writing-checker-accuracy' },
  { label: 'Blog', href: '/blog' },
];

const RESOURCE_LINKS = [
  { label: 'About Us', href: '/about' },
  { label: 'Contact Us', href: '/contactus' },
  { label: 'Editorial Policy', href: '/editorial-policy' },
];

const LEGAL_LINKS = [
  { label: 'Privacy Policy', href: '/privacypolicy' },
  { label: 'Terms of Service', href: '/termsofservice' },
];

// Part-guide hubs, shown as a compact row under the columns.
const PART_GUIDE_LINKS = [
  { label: 'Listening Part 1', href: '/listening/part-1' },
  { label: 'Listening Part 2', href: '/listening/part-2' },
  { label: 'Listening Part 3', href: '/listening/part-3' },
  { label: 'Listening Part 4', href: '/listening/part-4' },
  { label: 'Speaking Part 1', href: '/speaking/part-1' },
  { label: 'Speaking Part 2', href: '/speaking/part-2' },
  { label: 'Speaking Part 3', href: '/speaking/part-3' },
];

function FooterColumn({ title, links, children }) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
      {/* py-1 keeps each row a comfortable tap target on touch screens. */}
      <ul className="mt-3 space-y-1.5">
        {links.map((link) => (
          <li key={link.label}>
            <NextLink
              href={link.href}
              className="inline-block py-1 text-sm text-slate-300 no-underline transition-colors hover:text-white"
            >
              {link.label}
            </NextLink>
          </li>
        ))}
        {children}
      </ul>
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="mt-auto bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4 lg:grid-cols-7">
          {/* Brand blurb */}
          <div className="col-span-2 md:col-span-4 lg:col-span-2">
            <NextLink href="/" className="flex items-center gap-2.5 no-underline">
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-white/5 ring-1 ring-white/10">
                <Image src="/image.png" alt="IELTS-Bank logo" width={28} height={28} className="h-7 w-7 object-contain" />
              </span>
              <span className="text-lg font-bold tracking-tight text-white">
                IELTS<span className="text-accent">-Bank</span>
              </span>
            </NextLink>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
              Free IELTS practice across Reading, Writing, Listening and Speaking,
              with instant scoring, AI band feedback and high-band Writing model answers.
            </p>
            <div className="mt-6 max-w-sm">
              <h2 className="text-sm font-semibold text-white">
                Get new practice tests in your inbox
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                One useful email a week. No spam, unsubscribe anytime.
              </p>
              <NewsletterSignup source="footer" variant="compact" className="mt-3" />
            </div>
          </div>

          <FooterColumn title="Practice" links={PRACTICE_LINKS} />
          <FooterColumn title="Tools" links={TOOLS_LINKS} />
          <FooterColumn title="Guides" links={GUIDE_LINKS} />
          <FooterColumn title="Resources" links={RESOURCE_LINKS} />
          <FooterColumn title="Legal" links={LEGAL_LINKS} />
        </div>

        <nav aria-label="Part guides" className="mt-10">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {PART_GUIDE_LINKS.map((link) => (
              <li key={link.href}>
                <NextLink
                  href={link.href}
                  className="inline-block py-1 text-xs text-slate-400 no-underline transition-colors hover:text-white"
                >
                  {link.label}
                </NextLink>
              </li>
            ))}
          </ul>
        </nav>

        <Separator className="my-10 bg-white/10" />

        <div className="flex flex-col gap-6">
          <p className="text-sm font-medium text-slate-400">
            © {new Date().getFullYear()} IELTS-Bank. All rights reserved.
          </p>
          <p className="max-w-3xl text-xs leading-relaxed text-slate-500">
            IELTS-Bank is an independent study resource and is not affiliated with, endorsed by, or connected to the British Council, IDP: IELTS Australia, or Cambridge University Press &amp; Assessment. &quot;IELTS&quot; is a registered trademark of its respective owners and is used here for descriptive purposes only.
          </p>
        </div>
      </div>
    </footer>
  );
}
