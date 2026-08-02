import React, { useState, useEffect, useRef } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import Image from 'next/image';
import {
  Menu,
  ArrowRight,
  BookOpen,
  PenLine,
  Headphones,
  Mic,
  Newspaper,
  LayoutDashboard,
  LogOut,
  ClipboardCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { Separator } from '../../components/ui/separator';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/auth';
import SignInDialog from './auth/SignInDialog';
import StudyingNowBadge from './StudyingNowBadge';
import StreakBadge from './StreakBadge';

// Pure Tailwind/shadcn Navbar. No Chakra imports — this renders on every page,
// including pages still built with Chakra, so it must be self-contained.

const NAV_LINKS = [
  { label: 'Reading', href: '/readingquestion', icon: BookOpen },
  { label: 'Writing', href: '/writingquestion', icon: PenLine },
  { label: 'Listening', href: '/listeningquestion', icon: Headphones },
  { label: 'Speaking', href: '/speakingquestion', icon: Mic },
  { label: 'Mock Tests', href: '/mock-test', icon: ClipboardCheck },
  { label: 'Blog', href: '/blog', icon: Newspaper },
  { label: 'Pro', href: '/pricing', icon: Sparkles },
];

function BrandMark() {
  return (
    <NextLink href="/" className="flex items-center gap-2.5 no-underline">
      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-primary/5 ring-1 ring-primary/10">
        <Image src="/image.png" alt="IELTS-Bank logo" width={28} height={28} className="h-7 w-7 object-contain" />
      </span>
      <span className="text-lg font-bold tracking-tight text-foreground">
        IELTS<span className="text-accent">-Bank</span>
      </span>
    </NextLink>
  );
}

function initialOf(email) {
  return (email || '?').trim().charAt(0).toUpperCase() || '?';
}

// Desktop account dropdown (avatar circle -> Dashboard / Sign out). Built with
// a click-outside handler to avoid adding a dropdown-menu dependency.
function AccountMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {initialOf(user?.email)}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-background p-1 shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="truncate text-sm font-medium text-foreground">{user?.email}</p>
          </div>
          <Separator />
          <NextLink
            href="/dashboard"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground no-underline transition-colors hover:bg-secondary"
          >
            <LayoutDashboard className="h-4 w-4 text-accent" />
            Dashboard
          </NextLink>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  // On any practice surface (question detail pages, mock runner) a signed-out
  // visitor is already practising — the CTA pivots from "Improve my IELTS band" to
  // creating an account (opens the signup dialog in place).
  const onQuestionPage = /^\/(reading|writing|listening|speaking)question\/\[|^\/mock\/\[/.test(
    router.pathname
  );
  const showCreateAccount = !loading && !user && onQuestionPage;

  const openAuth = (mode) => {
    setOpen(false);
    setAuthMode(mode);
    setSignInOpen(true);
  };
  const openSignIn = () => openAuth('signin');
  const openSignUp = () => openAuth('signup');

  return (
    <header className="sticky top-0 z-[1000] w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <BrandMark />

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 nav:flex">
          {NAV_LINKS.map((link) => (
            <NextLink
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground no-underline transition-colors',
                'hover:bg-secondary hover:text-foreground'
              )}
            >
              {link.label}
            </NextLink>
          ))}
        </nav>

        {/* Desktop CTA + account */}
        <div className="hidden items-center gap-2 nav:flex">
          <StreakBadge />
          {showCreateAccount ? (
            <Button variant="accent" className="shadow-sm" onClick={openSignUp}>
              Create account
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button asChild variant="accent" className="shadow-sm">
              <NextLink href="/readingquestion" className="no-underline">
                Improve my IELTS band
                <ArrowRight className="h-4 w-4" />
              </NextLink>
            </Button>
          )}

          {!loading && user ? (
            <AccountMenu user={user} onSignOut={signOut} />
          ) : !loading ? (
            <Button variant="outline" onClick={openSignIn}>
              Sign in
            </Button>
          ) : null}
        </div>

        {/* Mobile trigger */}
        <div className="flex items-center gap-1.5 nav:hidden">
          <StreakBadge />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
      <StudyingNowBadge />

      {/* Mobile sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          onClose={() => setOpen(false)}
          aria-label="Site navigation"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              IELTS<span className="text-accent">-Bank</span>
            </SheetTitle>
          </SheetHeader>
          <nav className="mt-2 flex flex-col gap-1">
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <NextLink
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-md px-3 py-3 text-base font-medium text-foreground no-underline transition-colors hover:bg-secondary"
                >
                  <Icon className="h-5 w-5 text-accent" />
                  {link.label}
                </NextLink>
              );
            })}
          </nav>
          {showCreateAccount ? (
            <Button variant="accent" size="lg" className="mt-2 w-full" onClick={openSignUp}>
              Create account
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button asChild variant="accent" size="lg" className="mt-2 w-full">
              <NextLink href="/readingquestion" onClick={() => setOpen(false)} className="no-underline">
                Improve my IELTS band
                <ArrowRight className="h-4 w-4" />
              </NextLink>
            </Button>
          )}

          {/* Account section (mobile) */}
          <Separator className="my-2" />
          {!loading && user ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3 px-1 py-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {initialOf(user.email)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Signed in as</p>
                  <p className="truncate text-sm font-medium text-foreground">{user.email}</p>
                </div>
              </div>
              <NextLink
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-3 text-base font-medium text-foreground no-underline transition-colors hover:bg-secondary"
              >
                <LayoutDashboard className="h-5 w-5 text-accent" />
                Dashboard
              </NextLink>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  signOut();
                }}
                className="flex items-center gap-3 rounded-md px-3 py-3 text-left text-base font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <LogOut className="h-5 w-5 text-muted-foreground" />
                Sign out
              </button>
            </div>
          ) : !loading ? (
            <Button variant="outline" size="lg" className="w-full" onClick={openSignIn}>
              Sign in
            </Button>
          ) : null}
        </SheetContent>
      </Sheet>

      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        initialMode={authMode}
      />
    </header>
  );
}
