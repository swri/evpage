'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from './button';

const emptySubscribe = () => () => {};

function useIsMounted() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

function subscribeTheme(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
}

function getThemeSnapshot() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

export function ThemeToggle({ className }: { className?: string }) {
  const mounted = useIsMounted();
  const isDark = React.useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    () => false
  );

  const toggleTheme = () => {
    const root = document.documentElement;
    const apply = () => {
      const willBeDark = !root.classList.contains('dark');
      if (willBeDark) {
        root.classList.add('dark');
        if (document.body) document.body.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        root.classList.remove('dark');
        if (document.body) document.body.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    };

    // Per-element color transitions would make the switch ripple; the whole
    // page cross-fades instead (where the View Transitions API exists)
    root.classList.add('theme-switching');
    const done = () =>
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof document.startViewTransition === 'function' && !reduceMotion) {
      document.startViewTransition(apply).finished.finally(done);
    } else {
      apply();
      done();
    }
  };

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        className={className || 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'}
      >
        <Moon className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
      title={isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
      className={
        className ||
        'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 cursor-pointer transition-colors'
      }
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400 animate-in spin-in-180 duration-300" />
      ) : (
        <Moon className="h-4 w-4 text-neutral-600 animate-in spin-in-180 duration-300" />
      )}
    </Button>
  );
}
