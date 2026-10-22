import * as React from 'react';
import { cn } from '@/lib/utils';

interface AppLogoIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
  theme?: 'dark' | 'light' | 'auto';
}

/**
 * Geometric Inverted Triangle Chevron Emblem
 * Inspired by modern monochrome architectural branding (EVP monogram)
 */
export function AppLogoIcon({
  size = 32,
  className,
  theme = 'auto',
  ...props
}: AppLogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0 transition-transform duration-200', className)}
      {...props}
    >
      {/* Outer Triangle Frame */}
      <path
        d="M10 18H90L50 86L10 18Z"
        className={cn(
          theme === 'dark'
            ? 'fill-white stroke-white'
            : theme === 'light'
            ? 'fill-black stroke-black'
            : 'fill-neutral-900 dark:fill-white stroke-neutral-900 dark:stroke-white'
        )}
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* Inner Geometric Cutout & Interlocking Chevron (Creating E - V - P Negative & Positive Space) */}
      <path
        d="M26 26H74L50 67L34 39H48L50 43L60 26H26Z"
        className={cn(
          theme === 'dark'
            ? 'fill-black'
            : theme === 'light'
            ? 'fill-white'
            : 'fill-white dark:fill-neutral-950'
        )}
      />

      {/* Dynamic Modern Central Notch (V / P Stem) */}
      <polygon
        points="50,52 64,28 54,28 46,42 41,33 33,33 46,55"
        className={cn(
          theme === 'dark'
            ? 'fill-white'
            : theme === 'light'
            ? 'fill-black'
            : 'fill-neutral-900 dark:fill-white'
        )}
      />
    </svg>
  );
}

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  subtitle?: string;
  className?: string;
  iconOnly?: boolean;
}

export function AppLogo({
  size = 'md',
  showText = true,
  subtitle,
  className,
  iconOnly = false,
}: AppLogoProps) {
  const iconSize =
    size === 'sm' ? 24 : size === 'md' ? 30 : size === 'lg' ? 40 : 52;

  const textClass =
    size === 'sm'
      ? 'text-sm'
      : size === 'md'
      ? 'text-base'
      : size === 'lg'
      ? 'text-xl'
      : 'text-2xl';

  const subTextClass =
    size === 'sm'
      ? 'text-[9px]'
      : size === 'md'
      ? 'text-[10px]'
      : size === 'lg'
      ? 'text-xs'
      : 'text-sm';

  return (
    <div className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      {/* Black & White Geometric Logo Emblem Box */}
      <div className="relative flex items-center justify-center rounded-xl bg-neutral-950 p-1.5 text-white shadow-sm dark:bg-white dark:text-neutral-950 transition-colors">
        <AppLogoIcon size={iconSize} />
      </div>

      {/* Typography: EVP + Optional Subtitle */}
      {!iconOnly && showText && (
        <div className="flex flex-col justify-center leading-none">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'font-black tracking-wider text-neutral-950 dark:text-white uppercase',
                textClass
              )}
            >
              EVP
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-900 dark:bg-white" />
          </div>
          {subtitle ? (
            <span
              className={cn(
                'mt-0.5 font-medium tracking-widest text-neutral-400 dark:text-neutral-400 uppercase',
                subTextClass
              )}
            >
              {subtitle}
            </span>
          ) : (
            <span
              className={cn(
                'mt-0.5 font-medium tracking-widest text-neutral-400 dark:text-neutral-500 uppercase',
                subTextClass
              )}
            >
              Event Platform
            </span>
          )}
        </div>
      )}
    </div>
  );
}
