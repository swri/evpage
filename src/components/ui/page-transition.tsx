import { ViewTransition } from 'react';

/**
 * Fades the old page out and lifts the new one in on route changes
 * (styles: .page-exit / .page-enter in globals.css). Navigations are React
 * transitions, so this needs no client code. Browsers without the View
 * Transitions API simply swap pages as before.
 *
 * Render it from a template.tsx, which remounts on each navigation into a
 * child segment. Don't key it by pathname: history.replaceState (used after
 * creating an event) changes the pathname and would remount the page.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
